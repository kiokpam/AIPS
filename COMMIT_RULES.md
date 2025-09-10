# Commit Rules

## Commit Message Format
- Use the following format for commit messages:
  ```
  <type>(<scope>): <short description>
  
  [optional body]
  [optional footer]
  ```
- **type**: feat, fix, docs, style, refactor, test, chore
- **scope**: the file or module affected (e.g., people_counter, models, utils)
- **short description**: concise summary of the change

### Example
```
feat(people_counter): add real-time counting logic
fix(utils): handle empty input edge case
```

## Scope of Each Commit
- Each commit should focus on changes to a single file or module whenever possible.
- Avoid mixing unrelated changes in one commit.
- If multiple files must be changed, clearly state all scopes in the message (e.g., feat(people_counter, models): integrate new model).

## Additional Guidelines
- Write clear, descriptive messages.
- Reference issues or pull requests in the footer if relevant (e.g., "Closes #12").
- Use English for all commit messages.
- Do not commit generated files, data, or environment folders.

---
Follow these rules to keep the commit history clean and understandable.
