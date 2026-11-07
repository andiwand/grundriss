"""A small U-Net for the segmentation of floor plans.

The network halves the image five times, so the height and the width must be multiples of 32.
The input has one gray channel (1 is white paper). The output has one score for each class.
"""

from __future__ import annotations

import torch
from torch import nn

CHANNELS = (16, 32, 64, 128, 160, 192)
# The classes of the contract (src/recognition/contract.ts), in the order of the output.
CLASSES = ["background", "wall", "door", "window"]
NUM_CLASSES = len(CLASSES)


def block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
    )


class UNet(nn.Module):
    def __init__(self, channels=CHANNELS, num_classes=NUM_CLASSES):
        super().__init__()
        self.down = nn.ModuleList()
        cin = 1
        for c in channels:
            self.down.append(block(cin, c))
            cin = c
        self.pool = nn.MaxPool2d(2)
        self.up = nn.ModuleList()
        self.merge = nn.ModuleList()
        for c_skip, c_low in zip(reversed(channels[:-1]), reversed(channels[1:])):
            self.up.append(nn.ConvTranspose2d(c_low, c_skip, 2, stride=2))
            self.merge.append(block(2 * c_skip, c_skip))
        self.head = nn.Conv2d(channels[0], num_classes, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # The paper is white, so the network sees ink as a positive value.
        x = 1.0 - x
        skips = []
        for i, down in enumerate(self.down):
            if i > 0:
                x = self.pool(x)
            x = down(x)
            skips.append(x)
        x = skips.pop()
        for up, merge in zip(self.up, self.merge):
            x = up(x)
            x = merge(torch.cat([x, skips.pop()], dim=1))
        return self.head(x)


def parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


if __name__ == "__main__":
    m = UNet()
    print(parameters(m))
    print(m(torch.rand(1, 1, 512, 512)).shape)
