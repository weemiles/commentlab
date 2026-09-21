"""Optionally verify a video's visible comment state with Jev Ultrafast.

This is deliberately separate from bulk collection. It uses the browser only
for the user-visible state that the YouTube Data API cannot describe.
"""

from __future__ import annotations

import argparse
import json

from jev_ultrafast import Agent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="Public YouTube video URL")
    parser.add_argument("--keep-open", action="store_true")
    args = parser.parse_args()

    goal = (
        "Open this YouTube video and determine whether a visible public comments "
        "section can be reached. Do not sign in, post, like, or modify anything. "
        "Stop when the comment section or a clear comments-disabled message is visible."
    )
    last_state = None
    agent = Agent(args.url, goal)
    try:
        for state in agent.run():
            last_state = state
            print(json.dumps({
                "status": state.get("status"),
                "elapsed_ms": state.get("elapsed_ms"),
            }, ensure_ascii=False))
    finally:
        if not args.keep_open:
            agent.close()

    if last_state is None:
        raise SystemExit("Jev returned no state")


if __name__ == "__main__":
    main()
