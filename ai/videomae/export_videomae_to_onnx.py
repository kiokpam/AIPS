"""
Export a VideoMAE PyTorch checkpoint to ONNX.

Usage:
  python export_videomae_to_onnx.py --ckpt videomae/best_checkpoint.pt --out videomae/videomae.onnx \
       --model-class "myrepo.mymodule:VideoMAE" --config videomae/configs.json

This script attempts to:
- load the checkpoint (supports dict with 'state_dict')
- import the provided model class (module:ClassName)
- if a config JSON is provided it will be passed as kwargs to the constructor
- export a dummy input (1,3,16,224,224) to ONNX

You must provide the model class used for training. If you cannot, send me the training model code and I can wire it in.
"""

import argparse
import importlib
import json
import os
import torch
from typing import Optional

# optional HF transformers path
try:
    from transformers.models.videomae.configuration_videomae import VideoMAEConfig
    from transformers import VideoMAEForVideoClassification
    _HAS_TRANSFORMERS = True
except Exception:
    VideoMAEConfig = None
    VideoMAEForVideoClassification = None
    _HAS_TRANSFORMERS = False


def import_model_class(spec: str):
    """Import a class from a spec 'module.path:ClassName'"""
    if ':' not in spec:
        raise ValueError("model-class must be in format module.path:ClassName")
    mod_name, cls_name = spec.split(':', 1)
    mod = importlib.import_module(mod_name)
    cls = getattr(mod, cls_name)
    return cls


def load_checkpoint_state(path, map_location='cpu'):
    # Newer PyTorch may default to weights_only=True and block some globals.
    # Try safe load first, then fall back to weights_only=False with allowlist if needed.
    try:
        sd = torch.load(path, map_location=map_location)
        return sd
    except Exception as e:
        # attempt fallback using weights_only=False for older checkpoints that require pickling
        try:
            # allow unsafe globals temporarily if torch supports the context manager
            if hasattr(torch.serialization, 'add_safe_globals'):
                torch.serialization.add_safe_globals(["numpy.core.multiarray.scalar"])
            sd = torch.load(path, map_location=map_location, weights_only=False)
            return sd
        except Exception as e2:
            # final fallback: re-raise original
            raise
    # unreachable but keep structure
    sd = None
    if isinstance(sd, dict):
        # common wrappers
        if 'state_dict' in sd:
            return sd['state_dict']
        # some checkpoints wrap under 'model'
        if 'model' in sd and isinstance(sd['model'], dict):
            return sd['model']
    return sd


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--ckpt', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--model-class', required=False, help='module.path:ClassName for your VideoMAE model (optional). If omitted the script will try HF VideoMAEConfig + VideoMAEForVideoClassification using --config')
    p.add_argument('--config', default=None, help='Optional JSON config to pass to model constructor or to build VideoMAEConfig for HF model')
    p.add_argument('--device', default='cpu')
    args = p.parse_args()

    device = torch.device('cuda' if args.device == 'cuda' and torch.cuda.is_available() else 'cpu')

    if not os.path.exists(args.ckpt):
        raise FileNotFoundError(args.ckpt)

    cfg = {}
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            try:
                cfg = json.load(f)
            except Exception:
                print('Warning: failed to parse config JSON, passing no kwargs')
                cfg = {}

    model = None
    if args.model_class:
        ModelCls = import_model_class(args.model_class)
        # instantiate model
        try:
            model = ModelCls(**cfg) if isinstance(cfg, dict) else ModelCls()
        except Exception as e:
            print('Failed to instantiate model with config kwargs:', e)
            print('Trying without kwargs...')
            model = ModelCls()
    else:
        # fallback to transformers VideoMAE if available
        if not _HAS_TRANSFORMERS:
            raise RuntimeError('transformers not available and --model-class not provided')
        # build config object
        try:
            cfg_obj = VideoMAEConfig(**cfg) if isinstance(cfg, dict) and cfg else VideoMAEConfig()
            model = VideoMAEForVideoClassification._from_config(cfg_obj)
            print('Instantiated VideoMAEForVideoClassification from config')
        except Exception as e:
            print('Failed to build HF VideoMAE model from config:', e)
            raise

    sd = load_checkpoint_state(args.ckpt, map_location='cpu')
    try:
        model.load_state_dict(sd)
    except Exception as e:
        print('Error loading state_dict into model:', e)
        try:
            model.load_state_dict(sd, strict=False)
            print('Loaded checkpoint with strict=False')
        except Exception as e2:
            print('Failed to load state_dict even with strict=False:', e2)
            raise

    model.eval()
    model.to(device)

    # determine dummy shape from cfg if available: (1, T, C, H, W)
    t = int(cfg.get('num_frames', 16)) if isinstance(cfg, dict) else 16
    c = int(cfg.get('num_channels', 3)) if isinstance(cfg, dict) else 3
    h = int(cfg.get('image_size', 224)) if isinstance(cfg, dict) else 224
    dummy = torch.randn(1, t, c, h, h).to(device)
    # export (use opset >= 14 to support scaled_dot_product_attention)
    torch.onnx.export(model, dummy, args.out, opset_version=14, input_names=['input'], output_names=['output'])
    print('Exported ONNX to', args.out)


if __name__ == '__main__':
    main()
