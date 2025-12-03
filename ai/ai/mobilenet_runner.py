"""MobileNet runner wrapper reusing mobi.py preprocessing and loading patterns."""
from typing import Tuple
import torch
import numpy as np
import cv2
from torchvision import models
import torch.nn as nn
import torchvision.transforms as T


class MobileNetRunner:
    def __init__(self, checkpoint: str, device: str = 'cpu'):
        self.device = torch.device(device if device in ('cpu', 'cuda') else 'cpu')
        self.model = models.mobilenet_v2(pretrained=False)
        in_feat = self.model.classifier[1].in_features
        self.model.classifier[1] = nn.Linear(in_feat, 1)
        ckpt = torch.load(checkpoint, map_location=self.device)
        state = ckpt.get('state_dict', ckpt) if isinstance(ckpt, dict) else ckpt
        cleaned = {k.replace('module.', ''): v for k, v in state.items()}
        try:
            self.model.load_state_dict(cleaned)
        except Exception:
            self.model.load_state_dict(cleaned, strict=False)
        self.model.to(self.device).eval()
        self.tf = T.Compose([
            T.ToPILImage(),
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

    def predict_on_crop(self, crop: np.ndarray) -> Tuple[str, float]:
        # crop coming in from OpenCV is BGR; convert to RGB for transforms
        img = crop
        try:
            if isinstance(crop, np.ndarray) and crop.ndim == 3 and crop.shape[2] == 3:
                img = crop[:, :, ::-1].copy()
        except Exception:
            img = crop
        inp = self.tf(img).unsqueeze(0).to(self.device)
        # use autocast when on CUDA for faster fp16 inference
        with torch.no_grad():
            if self.device.type == 'cuda':
                with torch.amp.autocast("cuda"):
                    out = self.model(inp)
            else:
                out = self.model(inp)

            if out.ndim == 2 and out.shape[1] == 1:
                prob = float(torch.sigmoid(out).cpu().numpy()[0][0])
                label = 'Suspicious' if prob > 0.5 else 'Normal'
            else:
                probs = torch.softmax(out, dim=1).cpu().numpy()[0]
                idx = int(np.argmax(probs))
                prob = float(probs[idx])
                label = 'Suspicious' if idx != 0 else 'Normal'
        return label, prob
