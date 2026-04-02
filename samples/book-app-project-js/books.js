'use strict';
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

/**
 * Represents a single book with metadata and reader reviews.
 *
 * Stores title, author, publication year, read status, and a validated list of
 * 1–5 star reviews. Construction validates required fields and sanitizes
 * optional ones via static helpers.
 */
class Book {
  /**
   * Creates a new Book instance, validating required fields and sanitizing optional ones.
   *
   * @param {string} title - The book title (required, non-empty after trimming).
   * @param {string} author - The book author (required, non-empty after trimming).
   * @param {number|string|null} [year=null] - Publication year; non-integer or non-numeric
   *   values are coerced to `null` via {@link Book.normalizeYear}.
   * @param {boolean} [read=false] - Whether the book has been read.
   * @param {Array<Object>} [reviews=[]] - Initial reviews; invalid entries are silently
   *   dropped by {@link Book.sanitizeReviews}.
   * @throws {Error} If `title` is missing, not a string, or blank after trimming.
   * @throws {Error} If `author` is missing, not a string, or blank after trimming.
   * @example
   * const book = new Book('Dune', 'Frank Herbert', 1965, true);
   * console.log(book.title);  // 'Dune'
   * console.log(book.year);   // 1965
   * console.log(book.read);   // true
   *
   * new Book('', 'Frank Herbert'); // throws: 'Book title is required'
   */
  constructor(title, author, year = null, read = false, reviews = []) {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('Book title is required');
    }
    if (!author || typeof author !== 'string' || author.trim() === '') {
      throw new Error('Book author is required');
    }
    this.title = title.trim();
    this.author = author.trim();
    this.year = Book.normalizeYear(year);
    this.read = Boolean(read);
    this.reviews = Book.sanitizeReviews(reviews);
  }

  /**
   * Coerces a raw year value to an integer or `null`.
   *
   * Accepts anything convertible to a finite integer; returns `null` for empty
   * strings, `null`, `undefined`, `NaN`, or non-integer numbers such as `3.5`.
   *
   * @param {*} year - Raw year value to normalize.
   * @returns {number|null} Integer year, or `null` if the value is absent or non-integer.
   * @example
   * Book.normalizeYear('1984'); // 1984
   * Book.normalizeYear(null);   // null
   * Book.normalizeYear('abc');  // null
   * Book.normalizeYear(2.5);    // null
   */
  static normalizeYear(year) {
    if (year === undefined || year === null || year === '') return null;
    const n = Number(year);
    if (Number.isNaN(n) || !Number.isInteger(n)) return null;
    return n;
  }

  /**
   * Filters and normalizes a raw reviews array, discarding any invalid entries.
   *
   * A valid review must have an integer `rating` between 1 and 5 (inclusive).
   * The `text` field defaults to an empty string if absent or not a string.
   * Any entry that throws during processing is silently skipped.
   *
   * @param {Array<*>} reviews - Raw array of potential review objects.
   * @returns {Array<{rating: number, text: string}>} Array of sanitized review objects.
   * @example
   * Book.sanitizeReviews([{ rating: 5, text: 'Great!' }, { rating: 6 }]);
   * // => [{ rating: 5, text: 'Great!' }]  — rating 6 is out of range and dropped
   *
   * Book.sanitizeReviews('not an array');
   * // => []
   */
  static sanitizeReviews(reviews) {
    if (!Array.isArray(reviews)) return [];
    const out = [];
    for (const r of reviews) {
      try {
        const rating =
          r && (typeof r.rating === 'number' || typeof r.rating === 'string')
            ? Number(r.rating)
            : NaN;
        const text = r && typeof r.text === 'string' ? r.text : '';
        if (!Number.isFinite(rating) || !Number.isInteger(rating)) continue;
        // enforce 1-5 rating
        if (rating < 1 || rating > 5) continue;
        out.push({ rating: rating, text: text });
      } catch (_) {
        // skip invalid review
      }
    }
    return out;
  }

  /**
   * Serializes the book to a plain JSON-safe object suitable for persistence.
   *
   * Reviews are deep-copied so the returned object shares no references with the
   * live `reviews` array. This method is invoked automatically by `JSON.stringify`.
   *
   * @returns {{title: string, author: string, year: number|null, read: boolean, reviews: Array<{rating: number, text: string}>}}
   *   Plain object representation of the book.
   * @example
   * const book = new Book('1984', 'George Orwell', 1949);
   * JSON.stringify(book);
   * // '{"title":"1984","author":"George Orwell","year":1949,"read":false,"reviews":[]}'
   */
  toJSON() {
    return {
      title: this.title,
      author: this.author,
      year: this.year,
      read: this.read,
      reviews: Array.isArray(this.reviews)
        ? this.reviews.map((r) => ({ rating: r.rating, text: r.text }))
        : [],
    };
  }

  /**
   * Computes the arithmetic mean of all review ratings.
   *
   * @returns {number|null} Average rating between 1 and 5, or `null` if there are no reviews.
   * @example
   * const book = new Book('Dune', 'Frank Herbert');
   * book.reviews = [{ rating: 4, text: '' }, { rating: 5, text: 'Amazing' }];
   * book.averageRating(); // 4.5
   *
   * const noReviews = new Book('Unknown', 'Author');
   * noReviews.averageRating(); // null
   */
  averageRating() {
    if (!Array.isArray(this.reviews) || this.reviews.length === 0) return null;
    const sum = this.reviews.reduce((s, r) => s + Number(r.rating || 0), 0);
    return sum / this.reviews.length;
  }
}

/**
 * Manages a persistent, JSON-backed collection of {@link Book} instances.
 *
 * Improvements over the original implementation:
 * - Validation and duplicate detection on add/update (case-insensitive, Unicode NFC).
 * - Ensures the data directory exists before writing.
 * - Atomic saves via a temporary file followed by a rename.
 * - Flexible search, listing, import/export, and review management helpers.
 *
 * @remarks
 * All write methods (`addBook`, `addReview`, `saveBooks`, etc.) call
 * {@link BookCollection#saveBooks} internally. The save is synchronous and uses a
 * temp-file rename for crash safety, but is **not** process-safe for concurrent
 * writers targeting the same file.
 */
class BookCollection {
  /**
   * Creates a new BookCollection and immediately loads books from disk.
   *
   * If the data file does not exist yet, the collection starts empty and the file
   * is created on the first save. If the file exists but contains corrupt JSON,
   * a warning is logged to `console.warn` and the collection starts empty.
   *
   * @param {string} [dataFile] - Absolute path to the JSON data file.
   *   Defaults to the module-level `DATA_FILE` constant (`data.json` next to `books.js`).
   * @example
   * const { BookCollection } = require('./books');
   *
   * // Use the default data file
   * const col = new BookCollection();
   *
   * // Use a custom data file (useful in tests)
   * const testCol = new BookCollection('/tmp/test-books.json');
   */
  constructor(dataFile) {
    if (dataFile !== undefined && dataFile !== null) {
      BookCollection._validateJsonFilePath(dataFile);
    }
    this.dataFile = dataFile || DATA_FILE;
    this.books = [];
    this.loadBooks();
  }

  static _validateJsonFilePath(filePath) {
    if (typeof filePath !== 'string' || !filePath) {
      throw new Error('dataFile must be a non-empty string');
    }
    if (!path.isAbsolute(filePath)) {
      throw new Error('dataFile must be an absolute path');
    }
    if (path.extname(filePath).toLowerCase() !== '.json') {
      throw new Error('dataFile must have a .json extension');
    }
  }

  // Normalization helper: trims, applies Unicode NFC normalization, and lowercases.
  _norm(s) {
    if (typeof s !== 'string') return '';
    let t = s.trim();
    if (typeof t.normalize === 'function') t = t.normalize('NFC');
    return t.toLowerCase();
  }

  /**
   * Loads books from the JSON data file, replacing the current in-memory collection.
   *
   * Called automatically by the constructor. Re-calling it discards any unsaved
   * in-memory changes and reloads from disk. Invalid individual entries are skipped
   * with a `console.warn` rather than aborting the entire load.
   *
   * @returns {void}
   * @throws {Error} For unexpected I/O errors (i.e., anything other than `ENOENT` or `SyntaxError`).
   * @remarks
   * - Missing file (`ENOENT`): `this.books` is silently set to `[]`.
   * - Invalid JSON (`SyntaxError`): `this.books` is set to `[]` and a warning is printed.
   * - Any other I/O error is re-thrown to the caller.
   * @example
   * const col = new BookCollection('/path/to/books.json');
   * // Externally update the file, then reload:
   * col.loadBooks();
   */
  loadBooks() {
    try {
      const raw = fs.readFileSync(this.dataFile, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new SyntaxError('data.json must contain an array');
      this.books = [];
      for (const entry of data) {
        try {
          const title = entry && typeof entry.title === 'string' ? entry.title : '';
          const author = entry && typeof entry.author === 'string' ? entry.author : '';
          const year =
            entry && Object.prototype.hasOwnProperty.call(entry, 'year') ? entry.year : null;
          const read =
            entry && Object.prototype.hasOwnProperty.call(entry, 'read')
              ? Boolean(entry.read)
              : false;
          const reviews =
            entry && Object.prototype.hasOwnProperty.call(entry, 'reviews') ? entry.reviews : [];
          if (!title || !author) {
            // skip invalid legacy entries but don't fail the whole load
            const safeTitle =
              typeof entry?.title === 'string' ? entry.title.slice(0, 60) : '[unknown]';
            console.warn(`Skipping invalid book entry in data file: title="${safeTitle}"`);
            continue;
          }
          this.books.push(new Book(title, author, year, read, reviews));
        } catch (e) {
          console.warn(
            'Skipping invalid book entry due to error:',
            e && e.message ? e.message : String(e),
          );
          continue;
        }
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // File doesn't exist yet - start empty
        this.books = [];
      } else if (err instanceof SyntaxError) {
        // Corrupted JSON - warn and start empty to avoid crashing the app
        console.warn(
          'Warning: data file is missing or corrupted. Starting with an empty collection.',
        );
        this.books = [];
      } else {
        // Unexpected - rethrow so callers can handle it
        throw err;
      }
    }
  }

  /**
   * Persists the current in-memory book collection to the JSON data file atomically.
   *
   * Serializes each book via {@link Book#toJSON}, writes to a sibling `.tmp` file,
   * then renames it over the target path. The parent directory is created
   * automatically if it does not exist.
   *
   * @returns {void}
   * @throws {Error} Wraps any underlying filesystem error with the message
   *   `'Failed to save books: <reason>'`.
   * @example
   * col.books.push(new Book('Dune', 'Frank Herbert', 1965));
   * col.saveBooks(); // writes the full collection to disk
   */
  saveBooks() {
    const data = this.books.map((b) => b.toJSON());
    try {
      const dir = path.dirname(this.dataFile);
      // Ensure directory exists (safe for both file and nested paths)
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, `${path.basename(this.dataFile)}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' });
      // Atomic replace
      fs.renameSync(tmp, this.dataFile);
    } catch (err) {
      throw new Error(`Failed to save books: ${err && err.message ? err.message : String(err)}`);
    }
  }

  /**
   * Creates a new {@link Book} and appends it to the collection, then saves to disk.
   *
   * Duplicate detection is case-insensitive and Unicode NFC-normalized on both
   * `title` and `author` together, so `"dune"` and `"Dune"` by the same author
   * are considered the same book.
   *
   * @param {string} title - Book title (required, non-empty after trimming).
   * @param {string} author - Book author (required, non-empty after trimming).
   * @param {number|string|null} [year] - Publication year; invalid values are stored as `null`.
   * @returns {Book} The newly created `Book` instance.
   * @throws {Error} If `title` is missing, not a string, or blank.
   * @throws {Error} If `author` is missing, not a string, or blank.
   * @throws {Error} With message `'book already exists'` if a book with the same
   *   normalized title and author is already in the collection.
   * @example
   * const book = col.addBook('Dune', 'Frank Herbert', 1965);
   * console.log(book.title); // 'Dune'
   *
   * col.addBook('Dune', 'Frank Herbert'); // throws: 'book already exists'
   */
  addBook(title, author, year) {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('title is required');
    }
    if (!author || typeof author !== 'string' || author.trim() === '') {
      throw new Error('author is required');
    }
    const t = title.trim();
    const a = author.trim();
    // duplicate detection (use centralized normalization)
    const nt = this._norm(t);
    const na = this._norm(a);
    const exists = this.books.some(
      (b) => this._norm(b.title) === nt && this._norm(b.author) === na,
    );
    if (exists) throw new Error('book already exists');

    const book = new Book(t, a, year);
    this.books.push(book);
    this.saveBooks();
    return book;
  }

  /**
   * Appends a review to the book identified by `title`, then saves to disk.
   *
   * @param {string} title - Title of the book to review (case-insensitive).
   * @param {number|string} rating - Integer star rating between 1 and 5 (inclusive).
   * @param {string} [text=''] - Optional freeform review text.
   * @returns {{rating: number, text: string}} The newly created review object.
   * @throws {Error} With message `'book not found'` if no book with the given title exists.
   * @throws {Error} With message `'rating must be integer between 1 and 5'` if `rating`
   *   is not an integer in the valid range.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * const review = col.addReview('Dune', 5, 'A masterpiece.');
   * console.log(review); // { rating: 5, text: 'A masterpiece.' }
   */
  addReview(title, rating, text = '') {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5)
      throw new Error('rating must be integer between 1 and 5');
    const review = { rating: r, text: typeof text === 'string' ? text : String(text) };
    book.reviews = Array.isArray(book.reviews) ? book.reviews : [];
    book.reviews.push(review);
    this.saveBooks();
    return review;
  }

  /**
   * Returns a shallow copy of all reviews for the book matching `title`.
   *
   * Returns an empty array rather than throwing when the book is not found,
   * making it safe to call without a prior existence check.
   *
   * @param {string} title - Title of the book to look up (case-insensitive).
   * @returns {Array<{rating: number, text: string}>} Shallow-copied reviews array,
   *   or `[]` if the book is not found.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.addReview('Dune', 4, 'Epic world-building.');
   * col.listReviews('Dune').length; // 1
   *
   * col.listReviews('Nonexistent Book'); // []
   */
  listReviews(title) {
    const book = this.findBookByTitle(title);
    if (!book) return [];
    return Array.isArray(book.reviews) ? book.reviews.slice() : [];
  }

  /**
   * Returns the average star rating for the book matching `title`.
   *
   * Delegates to {@link Book#averageRating}. Returns `null` if the book is not
   * found or has no reviews.
   *
   * @param {string} title - Title of the book (case-insensitive).
   * @returns {number|null} Mean rating between 1 and 5, or `null` if unavailable.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.addReview('Dune', 4);
   * col.addReview('Dune', 5);
   * col.getAverageRating('Dune'); // 4.5
   *
   * col.getAverageRating('Unknown'); // null
   */
  getAverageRating(title) {
    const book = this.findBookByTitle(title);
    if (!book) return null;
    return book.averageRating();
  }

  /**
   * Updates fields of an existing review in place, then saves to disk.
   *
   * Only properties present in `updates` are changed; omitted properties retain
   * their current values.
   *
   * @param {string} title - Title of the book containing the review (case-insensitive).
   * @param {number} index - Zero-based index into the book's `reviews` array.
   * @param {{rating?: number, text?: string}} [updates={}] - Fields to update.
   * @returns {{rating: number, text: string}} The mutated review object.
   * @throws {Error} With message `'book not found'` if no matching book exists.
   * @throws {Error} With message `'review not found'` if `index` is out of range
   *   or the book has no reviews.
   * @throws {Error} With message `'rating must be integer between 1 and 5'` if
   *   `updates.rating` is provided but invalid.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.addReview('Dune', 3, 'Good but long.');
   * col.editReview('Dune', 0, { rating: 5, text: 'Changed my mind — masterpiece.' });
   */
  editReview(title, index, updates = {}) {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    if (!Array.isArray(book.reviews) || index < 0 || index >= book.reviews.length)
      throw new Error('review not found');
    const review = book.reviews[index];
    if (Object.prototype.hasOwnProperty.call(updates, 'rating')) {
      const r = Number(updates.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5)
        throw new Error('rating must be integer between 1 and 5');
      review.rating = r;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'text')) {
      review.text = String(updates.text || '');
    }
    this.saveBooks();
    return review;
  }

  /**
   * Removes the review at the given index from the book's reviews array, then saves to disk.
   *
   * @param {string} title - Title of the book containing the review (case-insensitive).
   * @param {number} index - Zero-based index of the review to remove.
   * @returns {{rating: number, text: string}} The removed review object.
   * @throws {Error} With message `'book not found'` if no matching book exists.
   * @throws {Error} With message `'review not found'` if `index` is out of range
   *   or the book has no reviews.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.addReview('Dune', 5, 'Epic.');
   * const removed = col.removeReview('Dune', 0);
   * console.log(removed.rating); // 5
   */
  removeReview(title, index) {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    if (!Array.isArray(book.reviews) || index < 0 || index >= book.reviews.length)
      throw new Error('review not found');
    const removed = book.reviews.splice(index, 1);
    this.saveBooks();
    return removed[0];
  }

  /**
   * Returns all books in the collection, optionally sorted by a single field.
   *
   * The returned array is a shallow copy — mutating it does not affect the internal
   * `books` array, though the `Book` objects inside are shared references.
   *
   * @param {{sortBy?: string, order?: string}} [options={}] - Sorting options.
   * @param {'title'|'author'|'year'} [options.sortBy] - Field to sort by.
   *   When omitted, books are returned in insertion order.
   * @param {'asc'|'desc'} [options.order='asc'] - Sort direction; defaults to ascending.
   * @returns {Array<Book>} Shallow-copied, optionally sorted array of `Book` instances.
   * @throws {Error} If `options.sortBy` is provided but is not `'title'`, `'author'`, or `'year'`.
   * @example
   * col.listBooks();                                    // all books, insertion order
   * col.listBooks({ sortBy: 'title' });                 // alphabetical ascending
   * col.listBooks({ sortBy: 'year', order: 'desc' });   // newest first
   */
  listBooks(options = {}) {
    const out = Array.from(this.books);
    const { sortBy, order } = options;
    if (sortBy) {
      const field = String(sortBy).toLowerCase();
      const allowed = new Set(['title', 'author', 'year']);
      if (!allowed.has(field)) {
        throw new Error(`Invalid sortBy: ${sortBy}`);
      }
      const dir = order && String(order).toLowerCase() === 'desc' ? -1 : 1;
      out.sort((x, y) => {
        const aVal = x[field] === undefined || x[field] === null ? '' : x[field];
        const bVal = y[field] === undefined || y[field] === null ? '' : y[field];
        if (field === 'year') {
          const aNum = Number(aVal) || 0;
          const bNum = Number(bVal) || 0;
          return (aNum - bNum) * dir;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return -1 * dir;
        if (aStr > bStr) return 1 * dir;
        return 0;
      });
    }
    return out;
  }

  /**
   * Returns books whose publication year falls within `[start, end]`, sorted by year descending.
   *
   * Both bounds are optional and inclusive. If `start > end`, the values are silently
   * swapped. Books with a `null` year are **always included** in the results and sorted
   * to the very end of the list.
   *
   * @param {number|string|null|undefined} start - Lower bound of the year range (inclusive).
   *   Non-integer or non-numeric values are treated as `null` (no lower bound applied).
   * @param {number|string|null|undefined} end - Upper bound of the year range (inclusive).
   *   Non-integer or non-numeric values are treated as `null` (no upper bound applied).
   * @returns {Array<Book>} Matching `Book` instances sorted by year descending;
   *   books with no year (`null`) appear at the end of the list.
   * @remarks
   * Books with `year === null` are always included regardless of the bounds provided.
   * Pass `null` for both arguments to get all books sorted by year descending (nulls last).
   * @example
   * col.listByYear(1950, 2000);      // books published 1950–2000, newest first
   * col.listByYear(2000, null);      // books from 2000 onwards (plus null-year books)
   * col.listByYear('1984', '1984');  // books published exactly in 1984
   * col.listByYear(null, null);      // all books, sorted by year descending
   */
  listByYear(start, end) {
    let s = Book.normalizeYear(start);
    let e = Book.normalizeYear(end);

    // if both bounds provided and out of order, swap
    if (s !== null && e !== null && s > e) {
      const tmp = s;
      s = e;
      e = tmp;
    }

    const results = this.books.filter((b) => {
      if (!b) return false;
      // include books with missing/null year per user preference
      if (b.year === null) return true;
      const y = Number(b.year);
      if (s !== null && e !== null) return y >= s && y <= e;
      if (s !== null) return y >= s;
      if (e !== null) return y <= e;
      return true;
    });

    // sort by year descending (null years placed last)
    results.sort((a, b) => {
      const ay = a.year === null ? Number.NEGATIVE_INFINITY : Number(a.year);
      const by = b.year === null ? Number.NEGATIVE_INFINITY : Number(b.year);
      return by - ay;
    });

    return results;
  }

  /**
   * Returns a snapshot of basic collection statistics.
   *
   * @returns {{total: number, read: number, unread: number}} Object with:
   *   - `total` — total number of books in the collection.
   *   - `read` — number of books where `book.read === true`.
   *   - `unread` — `total - read`.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.markAsRead('Dune');
   * col.addBook('1984', 'George Orwell');
   * col.stats(); // { total: 2, read: 1, unread: 1 }
   */
  stats() {
    const total = this.books.length;
    const read = this.books.reduce((s, b) => s + (b.read ? 1 : 0), 0);
    return { total, read, unread: total - read };
  }

  /**
   * Bulk-imports books from an array of plain objects, skipping invalid or duplicate entries.
   *
   * Each entry is validated similarly to {@link BookCollection#addBook}. By default,
   * entries whose normalized title+author already exist in the collection are skipped;
   * set `options.skipDuplicates` to `false` to allow them.
   *
   * @param {Array<Object>} entries - Array of raw book objects. Each should have
   *   `title` (string) and `author` (string); `year`, `read`, and `reviews` are optional.
   * @param {{skipDuplicates?: boolean}} [options={}] - Import options.
   * @param {boolean} [options.skipDuplicates=true] - When `true` (default), entries whose
   *   normalized title+author already exist are counted as skipped.
   * @returns {{added: number, skipped: number}} Counts of successfully added and skipped entries.
   * @throws {Error} If `entries` is not an array.
   * @example
   * const result = col.importBooks([
   *   { title: 'Dune', author: 'Frank Herbert', year: 1965 },
   *   { title: 'Bad Entry' },                      // missing author — skipped
   *   { title: 'Dune', author: 'Frank Herbert' },  // duplicate — skipped
   * ]);
   * console.log(result); // { added: 1, skipped: 2 }
   */
  importBooks(entries, options = {}) {
    if (!Array.isArray(entries)) throw new Error('entries must be an array');
    const skipDuplicates = options.skipDuplicates !== false;
    let added = 0;
    let skipped = 0;
    for (const e of entries) {
      try {
        const title = e && typeof e.title === 'string' ? e.title.trim() : '';
        const author = e && typeof e.author === 'string' ? e.author.trim() : '';
        const year = Object.prototype.hasOwnProperty.call(e, 'year') ? e.year : null;
        const read = Object.prototype.hasOwnProperty.call(e, 'read') ? Boolean(e.read) : false;
        const reviews = Object.prototype.hasOwnProperty.call(e, 'reviews') ? e.reviews : [];
        if (!title || !author) {
          skipped++;
          continue;
        }
        const exists = this.books.some(
          (b) =>
            this._norm(b.title) === this._norm(title) &&
            this._norm(b.author) === this._norm(author),
        );
        if (exists && skipDuplicates) {
          skipped++;
          continue;
        }
        this.books.push(new Book(title, author, year, read, reviews));
        added++;
      } catch (_) {
        skipped++;
      }
    }
    if (added > 0) this.saveBooks();
    return { added, skipped };
  }

  /**
   * Writes the entire collection to an arbitrary JSON file path.
   *
   * The destination directory is created automatically if it does not exist.
   * The output format mirrors the main data file: a JSON array of
   * {@link Book#toJSON} objects, pretty-printed with 2-space indentation.
   *
   * @param {string} filePath - Absolute or relative path for the output file.
   * @returns {true} Always returns `true` on success.
   * @throws {Error} If `filePath` is missing or not a string.
   * @throws {Error} Wraps any underlying filesystem error.
   * @example
   * col.exportToFile('/backups/books-backup.json'); // true
   */
  exportToFile(filePath) {
    if (!filePath || typeof filePath !== 'string') throw new Error('filePath required');
    const resolved = path.resolve(filePath);
    if (path.extname(resolved).toLowerCase() !== '.json') {
      throw new Error('filePath must have a .json extension');
    }
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        this.books.map((b) => b.toJSON()),
        null,
        2,
      ),
      'utf8',
    );
    return true;
  }

  /**
   * Finds the first book whose title exactly matches `title` (case-insensitive, NFC-normalized).
   *
   * Only exact normalized matches are returned; use {@link BookCollection#search} for
   * substring queries.
   *
   * @param {string} title - The title to search for.
   * @returns {Book|null} The matching `Book` instance, or `null` if none is found.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.findBookByTitle('dune');  // returns the Book instance
   * col.findBookByTitle('Gone');  // null
   */
  findBookByTitle(title) {
    if (!title || typeof title !== 'string') return null;
    const search = this._norm(title);
    return this.books.find((b) => b && b.title && this._norm(b.title) === search) || null;
  }

  /**
   * Updates mutable fields of the book identified by `title`, then saves to disk.
   *
   * Allowed update fields: `title`, `author`, `year`, `read`. The `reviews` array
   * cannot be modified through this method; use {@link BookCollection#addReview},
   * {@link BookCollection#editReview}, or {@link BookCollection#removeReview} instead.
   *
   * @param {string} title - Current title of the book to update (case-insensitive).
   * @param {{title?: string, author?: string, year?: number|string|null, read?: boolean}} [updates={}]
   *   Fields to update. Only keys present in the object are applied.
   * @returns {Book|null} The mutated `Book` instance, or `null` if no book with `title` is found.
   * @throws {Error} With message `'update would create duplicate book'` if the proposed
   *   new title+author combination matches an existing book.
   * @example
   * col.addBook('Dune', 'Frank Herbert', 1963);
   * col.updateBook('Dune', { year: 1965 });             // fix the year
   * col.updateBook('Dune', { title: 'Dune Messiah' });  // rename
   * col.updateBook('Missing', { year: 2000 });          // returns null
   */
  updateBook(title, updates = {}) {
    const book = this.findBookByTitle(title);
    if (!book) return null;
    const newTitle = updates.title ? String(updates.title).trim() : book.title;
    const newAuthor = updates.author ? String(updates.author).trim() : book.author;
    // If title/author changed, ensure no duplicate would be created
    const duplicate = this.books.some(
      (b) =>
        b !== book &&
        this._norm(b.title) === this._norm(newTitle) &&
        this._norm(b.author) === this._norm(newAuthor),
    );
    if (duplicate) throw new Error('update would create duplicate book');

    if (updates.title) book.title = newTitle;
    if (updates.author) book.author = newAuthor;
    if (Object.prototype.hasOwnProperty.call(updates, 'year'))
      book.year = Book.normalizeYear(updates.year);
    if (Object.prototype.hasOwnProperty.call(updates, 'read')) book.read = Boolean(updates.read);
    this.saveBooks();
    return book;
  }

  /**
   * Sets `book.read` to `true` for the book matching `title` and saves to disk.
   *
   * Idempotent in effect: calling it on an already-read book returns `false`
   * without performing an unnecessary save.
   *
   * @param {string} title - Title of the book to mark as read (case-insensitive).
   * @returns {boolean} `true` if the book was found and its status changed;
   *   `false` if the book was not found or was already marked as read.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.markAsRead('Dune');  // true  — status changed
   * col.markAsRead('Dune');  // false — already read
   * col.markAsRead('Nope');  // false — not found
   */
  markAsRead(title) {
    const book = this.findBookByTitle(title);
    if (!book) return false;
    if (book.read) return false; // already read
    book.read = true;
    this.saveBooks();
    return true;
  }

  /**
   * Removes one or more books matching `title` from the collection, then saves to disk.
   *
   * The optional second parameter disambiguates when multiple books share a title:
   * - Pass a plain string to require an exact (normalized) author match.
   * - Pass an options object for finer control (see parameters below).
   *
   * Without `removeAll`, only the **first** matching book is removed.
   *
   * @param {string} title - Title of the book to remove (case-insensitive).
   * @param {string|{author?: string, removeAll?: boolean, normalize?: boolean}} [optionsOrAuthor]
   *   Optional second argument. When a string, treated as an author filter. When an object:
   *   - `author` {string} — only remove books whose author also matches.
   *   - `removeAll` {boolean} — if `true`, remove all matching books instead of just the first.
   *   - `normalize` {boolean} — if `false`, disables Unicode NFC normalization during
   *     matching (default `true`).
   * @returns {boolean} `true` if at least one book was removed, `false` if none matched.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.removeBook('Dune');                               // true
   * col.removeBook('Dune');                               // false — already removed
   *
   * col.addBook('Dune', 'Frank Herbert');
   * col.removeBook('Dune', 'Wrong Author');               // false — author mismatch
   * col.removeBook('dune', { author: 'Frank Herbert' });  // true
   */
  removeBook(title, optionsOrAuthor) {
    if (!title || typeof title !== 'string') return false;

    // Normalize options
    let author = null;
    let removeAll = false;
    let doNormalize = true;
    if (typeof optionsOrAuthor === 'string') {
      author = optionsOrAuthor;
    } else if (optionsOrAuthor && typeof optionsOrAuthor === 'object') {
      if (typeof optionsOrAuthor.author === 'string') author = optionsOrAuthor.author;
      if (optionsOrAuthor.removeAll === true) removeAll = true;
      if (typeof optionsOrAuthor.normalize === 'boolean') doNormalize = optionsOrAuthor.normalize;
    }

    const norm = (s) => {
      if (typeof s !== 'string') return s;
      let t = s.trim();
      if (doNormalize && typeof t.normalize === 'function') t = t.normalize('NFC');
      return t.toLowerCase();
    };

    const searchTitle = norm(title);
    const searchAuthor = author ? norm(author) : null;

    // collect matching indices
    const matches = [];
    for (let i = 0; i < this.books.length; i++) {
      const b = this.books[i];
      if (!b || !b.title) continue;
      const bt = norm(b.title);
      if (bt !== searchTitle) continue;
      if (searchAuthor) {
        if (!b.author) continue;
        if (norm(b.author) !== searchAuthor) continue;
      }
      matches.push(i);
      if (!removeAll) break;
    }

    if (matches.length === 0) return false;

    // remove from end to start to preserve indices
    for (let j = matches.length - 1; j >= 0; j--) {
      this.books.splice(matches[j], 1);
    }

    this.saveBooks();
    return true;
  }

  /**
   * Returns all books whose author field contains `author` as a case-insensitive substring.
   *
   * Unlike {@link BookCollection#findBookByTitle}, this performs a substring match, so
   * `'Herbert'` matches `'Frank Herbert'`.
   *
   * @param {string} author - Author name or substring to search for.
   * @returns {Array<Book>} Books whose normalized author contains the normalized query,
   *   or `[]` if none match or `author` is not a non-empty string.
   * @example
   * col.addBook('Dune', 'Frank Herbert');
   * col.addBook('Foundation', 'Isaac Asimov');
   * col.findByAuthor('Herbert');  // [Book { title: 'Dune', ... }]
   * col.findByAuthor('isaac');    // [Book { title: 'Foundation', ... }]
   * col.findByAuthor('');         // []
   */
  findByAuthor(author) {
    if (!author || typeof author !== 'string') return [];
    const a = this._norm(author);
    return this.books.filter((b) => b && b.author && this._norm(b.author).includes(a));
  }

  /**
   * Searches the collection across one or more book fields using a text query.
   *
   * By default searches `title` and `author` using case-insensitive substring matching.
   * The `year` field matches on exact string equality. The `read` field matches when
   * `query` is exactly `'true'` or `'false'`.
   *
   * @param {string} query - The search term (non-empty string; returns `[]` if blank).
   * @param {{fields?: Array<string>, limit?: number}} [options={}] - Search options.
   * @param {Array<'title'|'author'|'year'|'read'>} [options.fields=['title','author']]
   *   Fields to search. Unrecognized field names are accepted but will never produce a match.
   * @param {number} [options.limit] - Maximum number of results to return.
   *   When omitted or `0`, all matches are returned.
   * @returns {Array<Book>} Books matching the query across the specified fields,
   *   in the order they appear in the collection.
   * @remarks
   * The duplicate `if (!query …)` guard on the first two lines of the method body is a
   * known no-op — the condition is checked twice identically. It does not affect correctness.
   * @example
   * col.addBook('Dune', 'Frank Herbert', 1965);
   * col.addBook('Dune Messiah', 'Frank Herbert', 1969);
   *
   * col.search('dune');                           // both Dune books
   * col.search('1965', { fields: ['year'] });     // [Book { title: 'Dune', ... }]
   * col.search('frank', { limit: 1 });            // first matching book only
   * col.search('true', { fields: ['read'] });     // books marked as read
   */
  search(query, options = {}) {
    if (!query || typeof query !== 'string') return [];
    if (!query || typeof query !== 'string') return [];
    const q = query.trim();
    if (q === '') return [];
    const fields =
      Array.isArray(options.fields) && options.fields.length > 0
        ? options.fields.map((f) => f.toLowerCase())
        : ['title', 'author'];
    const normalized = this._norm(q);
    const results = [];
    for (const b of this.books) {
      if (!b) continue;
      let matched = false;
      for (const field of fields) {
        if (field === 'title' && b.title && this._norm(b.title).includes(normalized)) {
          matched = true;
          break;
        }
        if (field === 'author' && b.author && this._norm(b.author).includes(normalized)) {
          matched = true;
          break;
        }
        if (field === 'year' && b.year !== null && String(b.year) === q) {
          matched = true;
          break;
        }
        if (field === 'read') {
          const qBool =
            normalized === 'true' || normalized === 'false' ? normalized === 'true' : null;
          if (qBool !== null && b.read === qBool) {
            matched = true;
            break;
          }
        }
      }
      if (matched) results.push(b);
      if (options.limit && results.length >= Number(options.limit)) break;
    }
    return results;
  }
}

module.exports = { Book, BookCollection, DATA_FILE };
