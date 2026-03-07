#!/bin/bash
set -e

TODOS_FILE="docs/todos.yaml"
MAX_ITERATIONS=${1:-100}
SLEEP=${2:-2}

echo "Starting Ralph — todo-driven autonomous loop"
echo "Todos file: $TODOS_FILE"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo "==========================================="
    echo "  Iteration $i of $MAX_ITERATIONS"
    echo "==========================================="

    result=$(claude --dangerously-skip-permissions -p "You are Ralph, an autonomous agent working on the ai-books project.

## Your task file

Read \`$TODOS_FILE\`. This is a YAML list of todos. Each todo has:
- \`id\`: unique identifier (e.g. TODO-1)
- \`title\`: short description
- \`description\`: full details of what to do
- \`requires_human\`: boolean — if true, only a human can do this
- \`status\`: pending | in-progress | done
- \`depends-on\`: optional array of TODO IDs that must be done first

## Rules

1. Read \`$TODOS_FILE\` and find todos to work on.
2. Read CLAUDE.md for project context.
3. A todo is **blocked** if any ID in its \`depends-on\` array has status != done.
4. A todo is **actionable** if status == pending AND it is not blocked.
5. Skip todos where \`requires_human: true\` — you cannot do those.

## If you find an actionable todo (requires_human: false):

1. Pick the first actionable non-human todo (by order in file).
2. Update its \`status\` to \`in-progress\` in \`$TODOS_FILE\`.
3. Do the work described in the todo.
4. When done, update its \`status\` to \`done\` in \`$TODOS_FILE\`.
5. Output: <ralph>COMPLETED: [TODO-ID] [title]</ralph>

## If NO non-human todos are actionable:

Check if there are human-required todos that are actionable (pending + not blocked).
If yes, pick the one that would **unblock the most other todos** (count how many
other pending todos have it in their depends-on, directly or transitively).
Output its full details so the human can work on it:

<ralph>WAITING_FOR_HUMAN</ralph>
<human-task>
id: [TODO-ID]
title: [title]
description: |
  [full description from the todo]
</human-task>

## If ALL todos have status: done:

Output: <ralph>ALL_COMPLETE</ralph>

## Important

- Only work on ONE todo per iteration.
- Always update \`$TODOS_FILE\` to reflect status changes.
- Run \`pnpm build\` after code changes to verify they compile.
- If the build fails, revert your changes, set status back to pending, and note what went wrong.
- Do NOT commit — just update the todo file and do the work.")

    echo "$result"
    echo ""

    # All todos complete — exit successfully
    if [[ "$result" == *"<ralph>ALL_COMPLETE</ralph>"* ]]; then
        echo "==========================================="
        echo "  All todos complete after $i iterations!"
        echo "==========================================="
        exit 0
    fi

    # Ralph needs a human to do something
    if [[ "$result" == *"<ralph>WAITING_FOR_HUMAN</ralph>"* ]]; then
        echo ""
        echo "==========================================="
        echo "  Ralph is blocked — needs human action"
        echo "==========================================="
        echo ""
        echo "Complete the task above, then type 'done' to continue."
        echo "(Type 'skip' to skip this task, or 'quit' to exit.)"
        echo ""

        while true; do
            read -r -p "> " response
            case "$response" in
                done)
                    # Extract the TODO ID from the human-task block and mark it done
                    todo_id=$(echo "$result" | grep -A1 '<human-task>' | grep 'id:' | head -1 | sed 's/.*id: *//' | tr -d '[:space:]')
                    if [ -n "$todo_id" ]; then
                        claude --dangerously-skip-permissions -p "Read \`$TODOS_FILE\`. Find the todo with id: $todo_id and change its status from whatever it is to \`done\`. Write the updated file. Output only: <ralph>MARKED_DONE: $todo_id</ralph>"
                        echo ""
                        echo "Marked $todo_id as done. Continuing..."
                    else
                        echo "Could not extract TODO ID. Continuing anyway..."
                    fi
                    break
                    ;;
                skip)
                    echo "Skipping. Continuing to next iteration..."
                    break
                    ;;
                quit)
                    echo "Exiting Ralph."
                    exit 0
                    ;;
                *)
                    echo "Type 'done', 'skip', or 'quit'."
                    ;;
            esac
        done
    fi

    sleep "$SLEEP"
done

echo "==========================================="
echo "  Reached max iterations ($MAX_ITERATIONS)"
echo "==========================================="
exit 1
