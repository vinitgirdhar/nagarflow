# Project Context

## Overview
This repository contains the `nagarflow` project, which operates with a Python backend and a Next.js frontend ecosystem.

## Current Project Structure
- **/nagarflow-next/**: The core Next.js frontend. It follows the App Router architecture architecture, containing routing files in `app/` (e.g., reports, complaints, predictions, dispatch, emergency, agencies).
- **Backend Service**: Features a Python-based backend that runs via `app.py` in the root folder.
- **/static/**: Contains static assets and legacy HTML configurations.

## Always Active Rules
- **UI Consistency**: Maintain modern, responsive UI elements when updating components within `nagarflow-next`, continuing the transition to the full Next.js application paradigm.
- **Backend Communication**: Assure that Next.js frontend fetches adhere to the local specifications driven by the Python backend.
