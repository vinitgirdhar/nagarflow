"""Run the durable inbox worker. Use --once for a single scheduler tick."""
import argparse
import sys
import time
from pathlib import Path
from backend.app import app
from backend.intake.worker import run_cycle
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--once',action='store_true');args=parser.parse_args()
while True:
    try:run_cycle(app)
    except Exception as error:
        app.logger.error('Inbox worker cycle failed: %s',type(error).__name__)
        if args.once:raise SystemExit(1)
    if args.once:break
    time.sleep(5)
