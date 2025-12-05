"""Export VideoMAE model from videomae_runner to ONNX format.

This script loads the VideoMAE model using the same logic as videomae_runner.py
and exports it to ONNX format for inference optimization.
"""
import torch
import json
import os
from pathlib import Path
from transformers import VideoMAEForVideoClassification, AutoImageProcessor
from transformers.models.videomae.configuration_videomae import VideoMAEConfig
import torch.nn as nn


def load_videomae_model(model_dir: str, device: str = 'cpu'):
    """Load VideoMAE model using the same logic as VideoMAERunner."""
    device = torch.device(device if device in ('cpu', 'cuda') else 'cpu')
    model_dir = str(model_dir) if model_dir is not None else None
    
    # Load checkpoint and config
    state_dict = None
    cfg = {}
    
    try:
        cfg_path = os.path.join(model_dir, 'configs.json') if model_dir else None
        if cfg_path and os.path.exists(cfg_path):
            with open(cfg_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                
        ckpt_path = os.path.join(model_dir, 'best_checkpoint.pt') if model_dir else None
        print(f"Loading checkpoint from: {ckpt_path}")
        
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
        print(f"Checkpoint loaded successfully")
        
        if isinstance(ckpt, dict) and 'model' in ckpt:
            state_dict = ckpt['model']
        elif isinstance(ckpt, dict) and 'state_dict' in ckpt:
            state_dict = ckpt['state_dict']
        else:
            state_dict = ckpt
    except Exception as e:
        print(f"Failed to load checkpoint: {e}")
        state_dict = None

    # Infer num labels from state_dict
    inferred_num_labels = None
    if isinstance(state_dict, dict):
        for k, v in state_dict.items():
            if k.endswith('classifier.weight') or k.endswith('head.weight') or '.classifier.weight' in k or '.head.weight' in k:
                try:
                    inferred_num_labels = int(v.shape[0])
                    print(f"Inferred num_labels from checkpoint: {inferred_num_labels}")
                    break
                except Exception:
                    continue

    # Get desired number of labels from config
    desired_num_labels = None
    try:
        if cfg:
            id2label = cfg.get('id2label') or cfg.get('label2id')
            if id2label:
                try:
                    desired_num_labels = len(id2label)
                    print(f"Desired num_labels from config: {desired_num_labels}")
                except Exception:
                    try:
                        desired_num_labels = len({int(k): v for k, v in id2label.items()})
                        print(f"Desired num_labels from config (parsed): {desired_num_labels}")
                    except Exception:
                        desired_num_labels = None
    except Exception:
        desired_num_labels = None

    if desired_num_labels is None:
        desired_num_labels = inferred_num_labels

    # Instantiate model
    try:
        cfg_obj = VideoMAEConfig(**cfg) if cfg else VideoMAEConfig()
        if desired_num_labels is not None:
            setattr(cfg_obj, 'num_labels', desired_num_labels)
        elif inferred_num_labels is not None:
            setattr(cfg_obj, 'num_labels', inferred_num_labels)
        model = VideoMAEForVideoClassification.from_config(cfg_obj)
        print(f"Model instantiated from config with num_labels={desired_num_labels or inferred_num_labels}")
    except Exception as e:
        print(f"Failed to create model from config: {e}")
        try:
            model = VideoMAEForVideoClassification.from_pretrained(
                model_dir if model_dir else 'MCG-NJU/videomae-base-finetuned-kinetics',
                num_labels=desired_num_labels if desired_num_labels is not None else (inferred_num_labels if inferred_num_labels is not None else None)
            )
        except Exception:
            model = VideoMAEForVideoClassification.from_pretrained('MCG-NJU/videomae-base-finetuned-kinetics')

    # Rebuild classifier if needed
    if desired_num_labels is not None:
        try:
            target_out = desired_num_labels
            in_f = None
            
            if hasattr(model, 'classifier'):
                cur = getattr(model, 'classifier')
                try:
                    if hasattr(cur, 'weight'):
                        in_f = int(cur.weight.data.shape[1])
                    else:
                        in_f = int(cur[1].in_features)
                except Exception:
                    in_f = None
                    
            if in_f is None and hasattr(model, 'head'):
                try:
                    in_f = int(model.head.weight.data.shape[1])
                except Exception:
                    in_f = None
                    
            if in_f is None:
                try:
                    in_f = int(cfg.get('hidden_size', 768))
                except Exception:
                    in_f = 768

            if hasattr(model, 'classifier'):
                try:
                    model.classifier = nn.Linear(in_f, target_out).to(device)
                except Exception:
                    try:
                        model.classifier[1] = nn.Linear(in_f, target_out).to(device)
                    except Exception:
                        pass
            elif hasattr(model, 'head'):
                try:
                    model.head = nn.Linear(in_f, target_out).to(device)
                except Exception:
                    pass
        except Exception as e:
            print(f"Failed to rebuild classifier: {e}")

    # Load state dict with shape repair
    if state_dict is not None:
        try:
            ck_shape = None
            for k, v in state_dict.items():
                if k.endswith('classifier.weight') or k.endswith('head.weight') or '.classifier.weight' in k or '.head.weight' in k:
                    ck_shape = v.shape
                    break
                    
            if ck_shape is not None:
                out_f, in_f = int(ck_shape[0]), int(ck_shape[1])
                target_out = desired_num_labels if desired_num_labels is not None else out_f
                
                if hasattr(model, 'classifier'):
                    try:
                        cur = getattr(model, 'classifier')
                        if hasattr(cur, 'weight'):
                            cur_w = tuple(cur.weight.data.shape)
                            if cur_w != (target_out, in_f):
                                model.classifier = nn.Linear(in_f, target_out).to(device)
                        else:
                            try:
                                in_feat = model.classifier[1].in_features
                                model.classifier[1] = nn.Linear(in_feat, target_out).to(device)
                            except Exception:
                                model.classifier = nn.Linear(in_f, target_out).to(device)
                    except Exception:
                        model.classifier = nn.Linear(in_f, target_out).to(device)
                else:
                    if hasattr(model, 'head'):
                        try:
                            cur_w = tuple(model.head.weight.data.shape)
                            if cur_w != (target_out, in_f):
                                model.head = nn.Linear(in_f, target_out).to(device)
                        except Exception:
                            try:
                                model.head = nn.Linear(in_f, target_out).to(device)
                            except Exception:
                                pass
        except Exception as e:
            print(f"Failed to repair classifier shape: {e}")

        try:
            model.load_state_dict(state_dict, strict=False)
            print("State dict loaded successfully (strict=False)")
        except Exception as e:
            print(f"Failed to load state dict with strict=False: {e}")
            try:
                model.load_state_dict(state_dict)
                print("State dict loaded successfully (strict=True)")
            except Exception as e2:
                print(f"Failed to load state dict: {e2}")

    model.to(device).eval()
    return model, cfg


def export_to_onnx(model, output_path: str, num_frames: int = 16, height: int = 224, width: int = 224):
    """Export VideoMAE model to ONNX format."""
    # Create dummy input: (batch_size, num_frames, channels, height, width)
    dummy_input = torch.randn(1, num_frames, 3, height, width)
    
    print(f"\nExporting model to ONNX...")
    print(f"Input shape: {dummy_input.shape}")
    print(f"Output path: {output_path}")
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    
    # Export to ONNX
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['pixel_values'],
        output_names=['logits'],
        dynamic_axes={
            'pixel_values': {0: 'batch_size'},
            'logits': {0: 'batch_size'}
        },
        opset_version=18,
        do_constant_folding=True,
    )
    
    print(f"✅ Model exported to {output_path}")
    
    # Verify the exported model
    try:
        import onnx
        onnx_model = onnx.load(output_path)
        onnx.checker.check_model(onnx_model)
        print("✅ ONNX model is valid")
        
        # Print model info
        print(f"\nModel info:")
        print(f"  IR version: {onnx_model.ir_version}")
        print(f"  Opset version: {onnx_model.opset_import[0].version}")
        print(f"  Inputs: {[inp.name for inp in onnx_model.graph.input]}")
        print(f"  Outputs: {[out.name for out in onnx_model.graph.output]}")
    except ImportError:
        print("⚠️ onnx package not installed, skipping validation")
    except Exception as e:
        print(f"⚠️ ONNX validation failed: {e}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Export VideoMAE model to ONNX')
    parser.add_argument('--model_dir', type=str, required=True,
                        help='Path to model directory containing configs.json and best_checkpoint.pt')
    parser.add_argument('--output', type=str, default=None,
                        help='Output ONNX file path (default: model_dir/videomae_runner.onnx)')
    parser.add_argument('--num_frames', type=int, default=16,
                        help='Number of frames for input (default: 16)')
    parser.add_argument('--height', type=int, default=224,
                        help='Frame height (default: 224)')
    parser.add_argument('--width', type=int, default=224,
                        help='Frame width (default: 224)')
    parser.add_argument('--device', type=str, default='cpu',
                        choices=['cpu', 'cuda'],
                        help='Device to use for export (default: cpu)')
    
    args = parser.parse_args()
    
    # Load model
    print(f"Loading VideoMAE model from {args.model_dir}...")
    model, cfg = load_videomae_model(args.model_dir, device=args.device)
    
    # Determine output path
    if args.output is None:
        output_path = os.path.join(args.model_dir, 'videomae_runner.onnx')
    else:
        output_path = args.output
    
    # Export to ONNX
    export_to_onnx(
        model,
        output_path,
        num_frames=args.num_frames,
        height=args.height,
        width=args.width
    )
    
    # Print label mapping if available
    if cfg and ('id2label' in cfg or 'label2id' in cfg):
        print("\nLabel mapping:")
        id2label = cfg.get('id2label') or cfg.get('label2id')
        try:
            items = sorted(((int(k), v) for k, v in id2label.items()), key=lambda x: x[0])
            for idx, label in items:
                print(f"  {idx}: {label}")
        except Exception:
            for k, v in id2label.items():
                print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
