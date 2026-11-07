# Recognition: training

This folder makes the model of the automatic recognition: a small U-Net that finds walls, doors,
and windows in a floor plan. The app runs the model in the browser with ONNX Runtime Web. The
contract between the model and the app is in
[`src/recognition/contract.ts`](../../src/recognition/contract.ts).

The training uses only synthetic data. `generate.py` draws random buildings and adds the faults
of a scan. No other dataset and no pretrained weights go into the model, so its license is the
license of Grundriss (MPL-2.0).

## Files

| File          | What                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| `generate.py` | The synthetic plans and their labels. The command writes sample images. |
| `model.py`    | The U-Net.                                                             |
| `train.py`    | The training on new samples, with a fixed validation set.              |
| `predict.py`  | Images of the predictions, for synthetic plans or for real scans.      |
| `export.py`   | The export to ONNX and the metadata for the app.                       |

The training writes its checkpoints and its log to `checkpoints/`. Git ignores that folder and
the environment `.venv/`.

## Set up

The environment needs [uv](https://docs.astral.sh/uv/). PyTorch has no wheels for the newest
Python yet, so the project uses Python 3.12.

```sh
cd scripts/recognition
uv python install 3.12
uv sync
```

The environment is about 0.9 GB.

## Make the model

1. Look at some samples. Each image shows the plan on the left and the label on the right.

   ```sh
   uv run python generate.py --out /tmp/samples --count 12 --full
   ```

2. Train. On an Apple M3 Pro, the training uses the GPU (MPS) and takes the time that you give.

   ```sh
   uv run python train.py --minutes 70
   ```

3. Look at the predictions. Add `--image` with a real scan to test it.

   ```sh
   uv run python predict.py --out /tmp/predictions --count 6 --image my-plan.jpg
   ```

4. Export the model to `public/models/recognition/`.

   ```sh
   uv run python export.py
   ```

## The labels

| Value | Class      | What                                                          |
| ----- | ---------- | ------------------------------------------------------------- |
| 0     | background | All that is not a wall or an opening.                         |
| 1     | wall       | The full body of a wall, also for a wall drawn as two lines.  |
| 2     | door       | The gap of a door in the wall, as thick as the wall. An opening without a door is also a door. |
| 3     | window     | The gap of a window in the wall, as thick as the wall.        |

The leaf and the arc of a door are background. So are furniture, stairs, text, and dimensions.

## Limits

The generator draws only straight walls at right angles, before a small rotation of the scan.
Round walls, walls at 45 degrees, and colored plans are not in the data. A real scan that looks
very different from the samples can give weak results.
