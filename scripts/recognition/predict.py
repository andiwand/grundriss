"""Writes images of the predictions of a checkpoint: the input, the label, and the prediction.

    uv run python predict.py --out /tmp/predictions --count 6
"""

from __future__ import annotations

import argparse
import os

import cv2
import numpy as np
import torch

import generate
from model import UNet


def predict(model: UNet, img: np.ndarray) -> np.ndarray:
    """The class of each pixel of a whole plan. The image is padded to a multiple of 32."""
    h, w = img.shape
    ph, pw = (-h) % 32, (-w) % 32
    padded = cv2.copyMakeBorder(img, 0, ph, 0, pw, cv2.BORDER_CONSTANT, value=255)
    x = torch.from_numpy(padded).float()[None, None] / 255.0
    with torch.no_grad():
        return model(x)[0].argmax(0).numpy()[:h, :w].astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default=os.path.join(os.path.dirname(__file__), "checkpoints", "best.pt"))
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=6)
    parser.add_argument("--seed", type=int, default=2024)
    parser.add_argument("--image", action="append", default=[], help="a real plan to test")
    args = parser.parse_args()
    model = UNet()
    model.load_state_dict(torch.load(args.checkpoint, map_location="cpu"))
    model.eval()
    os.makedirs(args.out, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    for i in range(args.count):
        img, label = generate.full_sample(rng)
        pred = predict(model, img)
        row = np.hstack([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), generate.colorize(label), generate.colorize(pred)])
        cv2.imwrite(os.path.join(args.out, f"predict-{i:02d}.png"), row)
    for path in args.image:
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        k = generate.LONG_SIDE / max(img.shape)
        img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        pred = predict(model, img)
        row = np.hstack([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), generate.colorize(pred)])
        cv2.imwrite(os.path.join(args.out, "real-" + os.path.basename(path) + ".png"), row)
    print(f"wrote predictions to {args.out}")


if __name__ == "__main__":
    main()
