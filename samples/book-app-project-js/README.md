# Book Collection App

*(This README is intentionally rough so you can improve it with GitHub Copilot CLI)*

A JavaScript app for managing books you have or want to read.
It can add, remove, and list books. Also mark them as read.

---

## Current Features

* Reads books from a JSON file (our database)
* Ratings & reviews per book (ratings 1-5, multiple reviews with optional text)
* CLI commands to add/list/edit/remove reviews and show average rating
* Input checking is improved; tests added for reviews

Usage examples

Add a review (non-interactive):

  node book_app.js review add "Dune" 5 "Amazing world-building"

Add a review (interactive):

  node book_app.js review add

List reviews for a book:

  node book_app.js review list "Dune"

Show average ratings for all books:

  node book_app.js review stats

Edit a review (interactive):

  node book_app.js review edit

Remove a review (non-interactive):

  node book_app.js review remove "Dune" 0

---

## Files

* `book_app.js` - Main CLI entry point
* `books.js` - BookCollection class with data logic
* `utils.js` - Helper functions for UI and input
* `data.json` - Sample book data
* `find` - Search books by title or author (partial, case-insensitive). Usage: `node book_app.js find <query>` or run `node book_app.js find` and follow prompts.
* `tests/test_books.js` - Starter tests using Node's built-in test runner

---

## Running the App

```bash
node book_app.js list
node book_app.js add
node book_app.js find
node book_app.js remove
node book_app.js help
```

## Running Tests

```bash
npm test
```

---

## Notes

* Not production-ready (obviously)
* Some code could be improved
* Could add more commands later
