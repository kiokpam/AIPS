"""Utility: convert models to ONNX for infer_mobilenet.py

- Exports Ultralytics YOLO model via yolo.export (if available)
- Exports Mobilenet PyTorch checkpoint to ONNX
- Attempts to export DeepSort ReID model if provided (best-effort)

Usage examples:
  python3 convert_to_onnx.py --yolo yolov8n.pt --mobilenet mobilenet_pytorch_best.pth --outdir ./onnx
"""
import os
import argparse
import torch
import numpy as np


def export_mobilenet(ckpt_path, out_path, input_size=224, device='cpu'):
    from torchvision import models
    import torch.nn as nn

    # build small mobilenet v2
    model = models.mobilenet_v2(pretrained=False)
    in_feat = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_feat, 1)
    # load checkpoint
    ckpt = torch.load(ckpt_path, map_location=device)
    state = ckpt.get('state_dict', ckpt) if isinstance(ckpt, dict) else ckpt
    cleaned = {k.replace('module.', ''): v for k, v in state.items()}
    model.load_state_dict(cleaned, strict=False)
    model.eval()
    model.to(device)

    dummy = torch.randn(1, 3, input_size, input_size, device=device)
    try:
        torch.onnx.export(model, dummy, out_path, opset_version=13, input_names=['input'], output_names=['output'], dynamic_axes={'input':{0:'batch'}, 'output':{0:'batch'}})
        print('[ok] exported mobilenet to', out_path)
    except Exception as e:
        print('[warn] ONNX export failed:', e)
        # fallback: save TorchScript for faster loading if ONNX not possible
        try:
            ts = torch.jit.trace(model, dummy.cpu())
            ts_path = out_path.replace('.onnx', '.pt')
            torch.jit.save(ts, ts_path)
            print('[ok] saved TorchScript fallback to', ts_path)
        except Exception as e2:
            print('[err] TorchScript fallback failed:', e2)


def export_yolo_ultralytics(yolo_weights, out_path, imgsz=640):
    try:
        from ultralytics import YOLO
    except Exception as e:
        print('[err] ultralytics not available:', e)
        return
    model = YOLO(yolo_weights)
    # try model.export
    try:
        model.export(format='onnx', imgsz=imgsz, half=False, simplify=True, project=os.path.dirname(out_path), name=os.path.basename(out_path).replace('.onnx',''))
        print('[ok] requested ultralytics export; check output dir for onnx')
    except Exception as e:
        print('[err] ultralytics export failed:', e)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--yolo', type=str, default=None)
    parser.add_argument('--mobilenet', type=str, default=None)
    parser.add_argument('--deepsort-reid', type=str, default=None, help='Path to Deepsort ReID model if available')
    parser.add_argument('--outdir', type=str, default='./onnx')
    parser.add_argument('--imgsz', type=int, default=640)
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'[info] export device: {device}')
    if args.mobilenet:
        outm = os.path.join(args.outdir, 'mobilenet.onnx')
        export_mobilenet(args.mobilenet, outm, input_size=224, device=device)
    if args.yolo:
        export_yolo_ultralytics(args.yolo, os.path.join(args.outdir, 'yolo.onnx'), imgsz=args.imgsz)
    if args.deepsort_reid:
        print('[info] Deepsort reid export not implemented automatically; supply a torchscript or onnx if available')

if __name__ == '__main__':
    main()
