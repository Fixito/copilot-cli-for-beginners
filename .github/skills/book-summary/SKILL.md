---
name: book-summary
description: Generate a formatted markdown summary of the book collection
---

# Book Summary Skill

When generating a summary of a book collection, follow this structure.

# Book Summary Generator

Generate a summary of the book collection following these rules:

1. Output a markdown table with columns: Title, Author, Year, Status
2. Use ✅ for read books and ❌ for unread books
3. Sort by year (oldest first)
4. Include a total count at the bottom
5. Flag any data issues (missing authors, invalid years)

## Temp

```markdown
| Title | Author        | Year | Status |
| ----- | ------------- | ---- | ------ |
| 1984  | George Orwell | 1949 | ✅     |
| Dune  | Frank Herbert | 1965 | ❌     |

**Total: 2 books (1 read, 1 unread)**
```
