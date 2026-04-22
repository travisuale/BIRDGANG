#!/bin/zsh

cd "/Users/travis/Documents/Codex _23/Timpview Recruiting/spring-ball-schedule" || exit 1

if [ -f .env ]; then
  export $(grep -v '^[[:space:]]*#' .env | xargs)
fi

python3 serve_app.py
