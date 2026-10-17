# Intelligence evaluation

Run `venv/bin/python scripts/evaluate_intelligence.py`. It uses temporary storage and writes `.cache/intelligence-evaluation.json`.

The current synthetic retrieval fixture passes 5/5 cases: three grounded document questions and two abstentions. This is a regression fixture, not a representative user-quality benchmark.

Historical bundled synthetic complaint data at cutoff 2026-04-04 yields 46 eligible zones. Each model uses seven rolling-origin one-day errors per zone (322 predictions per model). Mean per-zone absolute errors in complaint-count units: seasonal baseline 180.071; seven-day mean 139.892; fitted ridge regression 145.131. Per-zone model selection chooses seasonal for 6 zones, mean for 22 and ridge for 18.

Selection and reported errors use the same backtest; there is no independent holdout accuracy claim. Two-day projections and residual ranges are not calibrated confidence intervals. Missing calendar days are zero-filled, which can reflect missing intake rather than zero demand. Current stale or insufficient zones withhold forecasts. Live representative operator evaluation remains required.
