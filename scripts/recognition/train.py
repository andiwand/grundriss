"""Trains the U-Net on synthetic floor plans.

The training makes new samples on the fly, so it never sees the same plan twice. A fixed set of
samples with a fixed seed is the validation set. The loss is the cross-entropy with class weights
plus the Dice loss of the wall, door, and window classes.

    uv run python train.py --minutes 70
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, IterableDataset

import generate
from model import CLASSES, NUM_CLASSES, UNet, parameters

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKPOINTS = os.path.join(HERE, "checkpoints")
CLASS_WEIGHTS = torch.tensor([0.3, 1.0, 3.0, 3.0])


class Samples(IterableDataset):
    """Endless samples. Each worker has its own random generator."""

    def __init__(self, size: int, seed: int):
        self.size = size
        self.seed = seed

    def __iter__(self):
        info = torch.utils.data.get_worker_info()
        worker = info.id if info else 0
        rng = np.random.default_rng([self.seed, worker, int(time.time())])
        while True:
            img, label = generate.sample(rng, self.size)
            if rng.random() < 0.5:
                img, label = img[:, ::-1], label[:, ::-1]
            if rng.random() < 0.5:
                img, label = img[::-1], label[::-1]
            x = torch.from_numpy(np.ascontiguousarray(img)).float()[None] / 255.0
            y = torch.from_numpy(np.ascontiguousarray(label)).long()
            yield x, y


def validation_set(count: int, size: int) -> tuple[torch.Tensor, torch.Tensor]:
    rng = np.random.default_rng(12345)
    xs, ys = [], []
    for _ in range(count):
        img, label = generate.sample(rng, size)
        xs.append(torch.from_numpy(img).float()[None] / 255.0)
        ys.append(torch.from_numpy(label).long())
    return torch.stack(xs), torch.stack(ys)


def dice_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    probs = logits.softmax(1)
    onehot = F.one_hot(target, NUM_CLASSES).permute(0, 3, 1, 2).float()
    dims = (0, 2, 3)
    inter = (probs * onehot).sum(dims)
    total = probs.sum(dims) + onehot.sum(dims)
    dice = (2 * inter + 1) / (total + 1)
    return 1 - dice[1:].mean()


@torch.no_grad()
def evaluate(model, xs, ys, device, batch=8) -> list[float]:
    model.eval()
    inter = torch.zeros(NUM_CLASSES)
    union = torch.zeros(NUM_CLASSES)
    for i in range(0, len(xs), batch):
        pred = model(xs[i : i + batch].to(device)).argmax(1).cpu()
        y = ys[i : i + batch]
        for c in range(NUM_CLASSES):
            inter[c] += ((pred == c) & (y == c)).sum()
            union[c] += ((pred == c) | (y == c)).sum()
    model.train()
    return (inter / union.clamp(min=1)).tolist()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=float, default=70)
    parser.add_argument("--batch", type=int, default=12)
    parser.add_argument("--size", type=int, default=384)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--workers", type=int, default=9)
    parser.add_argument("--validation", type=int, default=96)
    parser.add_argument("--resume", default="")
    args = parser.parse_args()

    os.makedirs(CHECKPOINTS, exist_ok=True)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model = UNet().to(device)
    if args.resume:
        model.load_state_dict(torch.load(args.resume, map_location=device))
    print(f"parameters {parameters(model)}, device {device}", flush=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    weights = CLASS_WEIGHTS.to(device)

    val_x, val_y = validation_set(args.validation, 512)
    loader = DataLoader(
        Samples(args.size, seed=7),
        batch_size=args.batch,
        num_workers=args.workers,
        persistent_workers=True,
        prefetch_factor=4,
    )

    budget = args.minutes * 60
    start = time.time()
    last_eval = start
    best = -1.0
    step = 0
    history = []
    for x, y in loader:
        elapsed = time.time() - start
        if elapsed > budget:
            break
        # The learning rate warms up for 2 minutes, then falls on a cosine curve over the budget.
        t = elapsed / budget
        lr = args.lr * min(1.0, elapsed / 120) * 0.5 * (1 + math.cos(math.pi * t))
        for group in optimizer.param_groups:
            group["lr"] = max(lr, 1e-5)
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = F.cross_entropy(logits, y, weight=weights) + dice_loss(logits, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        step += 1
        if step % 50 == 0:
            print(f"step {step} t {elapsed / 60:.1f} min loss {loss.item():.4f} lr {lr:.5f}", flush=True)
        if time.time() - last_eval > 300:
            last_eval = time.time()
            iou = evaluate(model, val_x, val_y, device)
            score = float(np.mean(iou[1:]))
            history.append({"step": step, "minutes": round(elapsed / 60, 1), "iou": iou})
            print("val iou " + " ".join(f"{n} {v:.3f}" for n, v in zip(CLASSES, iou)), flush=True)
            torch.save(model.state_dict(), os.path.join(CHECKPOINTS, "last.pt"))
            if score > best:
                best = score
                torch.save(model.state_dict(), os.path.join(CHECKPOINTS, "best.pt"))

    iou = evaluate(model, val_x, val_y, device)
    history.append({"step": step, "minutes": round((time.time() - start) / 60, 1), "iou": iou})
    print("final val iou " + " ".join(f"{n} {v:.3f}" for n, v in zip(CLASSES, iou)), flush=True)
    torch.save(model.state_dict(), os.path.join(CHECKPOINTS, "last.pt"))
    if float(np.mean(iou[1:])) > best:
        torch.save(model.state_dict(), os.path.join(CHECKPOINTS, "best.pt"))
    with open(os.path.join(CHECKPOINTS, "history.json"), "w") as f:
        json.dump({"minutes": args.minutes, "steps": step, "history": history}, f, indent=1)


if __name__ == "__main__":
    main()
