'use strict';
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

/**
 * Simple Book model with lightweight validation and JSON serialization.
 * Extended to include reviews: array of { rating: number, text: string }
 */
class Book {
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

  static normalizeYear(year) {
    if (year === undefined || year === null || year === '') return null;
    const n = Number(year);
    if (Number.isNaN(n) || !Number.isInteger(n)) return null;
    return n;
  }

  static sanitizeReviews(reviews) {
    if (!Array.isArray(reviews)) return [];
    const out = [];
    for (const r of reviews) {
      try {
        const rating = r && (typeof r.rating === 'number' || typeof r.rating === 'string') ? Number(r.rating) : NaN;
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

  toJSON() {
    return {
      title: this.title,
      author: this.author,
      year: this.year,
      read: this.read,
      reviews: Array.isArray(this.reviews) ? this.reviews.map((r) => ({ rating: r.rating, text: r.text })) : [],
    };
  }

  averageRating() {
    if (!Array.isArray(this.reviews) || this.reviews.length === 0) return null;
    const sum = this.reviews.reduce((s, r) => s + Number(r.rating || 0), 0);
    return sum / this.reviews.length;
  }
}

/**
 * BookCollection manages a small JSON-backed collection of Book instances.
 * Improvements over the original:
 * - Validation and duplicate detection on add/update
 * - Ensures data directory exists before writing
 * - Safer save using temporary file + rename
 * - More flexible search and listing helpers
 */
class BookCollection {
  constructor(dataFile) {
    this.dataFile = dataFile || DATA_FILE;
    this.books = [];
    this.loadBooks();
  }

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
          const year = entry && Object.prototype.hasOwnProperty.call(entry, 'year') ? entry.year : null;
          const read = entry && Object.prototype.hasOwnProperty.call(entry, 'read') ? Boolean(entry.read) : false;
          const reviews = entry && Object.prototype.hasOwnProperty.call(entry, 'reviews') ? entry.reviews : [];
          if (!title || !author) {
            // skip invalid legacy entries but don't fail the whole load
            console.warn('Skipping invalid book entry in data file:', entry);
            continue;
          }
          this.books.push(new Book(title, author, year, read, reviews));
        } catch (e) {
          console.warn('Skipping invalid book entry due to error:', e && e.message ? e.message : String(e));
          continue;
        }
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // File doesn't exist yet - start empty
        this.books = [];
      } else if (err instanceof SyntaxError) {
        // Corrupted JSON - warn and start empty to avoid crashing the app
        console.warn('Warning: data file is missing or corrupted. Starting with an empty collection.');
        this.books = [];
      } else {
        // Unexpected - rethrow so callers can handle it
        throw err;
      }
    }
  }

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
   * Add a book after validating input and checking for duplicates (title+author case-insensitive).
   * Returns the created Book instance.
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
    // duplicate detection
    const exists = this.books.some((b) => b.title.toLowerCase() === t.toLowerCase() && b.author.toLowerCase() === a.toLowerCase());
    if (exists) throw new Error('book already exists');

    const book = new Book(t, a, year);
    this.books.push(book);
    this.saveBooks();
    return book;
  }

  /**
   * Add a review for a given book title. Rating must be integer between 1 and 5.
   * Returns the created review object or throws on validation error.
   */
  addReview(title, rating, text = '') {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error('rating must be integer between 1 and 5');
    const review = { rating: r, text: typeof text === 'string' ? text : String(text) };
    book.reviews = Array.isArray(book.reviews) ? book.reviews : [];
    book.reviews.push(review);
    this.saveBooks();
    return review;
  }

  listReviews(title) {
    const book = this.findBookByTitle(title);
    if (!book) return [];
    return Array.isArray(book.reviews) ? book.reviews.slice() : [];
  }

  getAverageRating(title) {
    const book = this.findBookByTitle(title);
    if (!book) return null;
    return book.averageRating();
  }

  editReview(title, index, updates = {}) {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    if (!Array.isArray(book.reviews) || index < 0 || index >= book.reviews.length) throw new Error('review not found');
    const review = book.reviews[index];
    if (Object.prototype.hasOwnProperty.call(updates, 'rating')) {
      const r = Number(updates.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error('rating must be integer between 1 and 5');
      review.rating = r;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'text')) {
      review.text = String(updates.text || '');
    }
    this.saveBooks();
    return review;
  }

  removeReview(title, index) {
    const book = this.findBookByTitle(title);
    if (!book) throw new Error('book not found');
    if (!Array.isArray(book.reviews) || index < 0 || index >= book.reviews.length) throw new Error('review not found');
    const removed = book.reviews.splice(index, 1);
    this.saveBooks();
    return removed[0];
  }

  /**
   * List books. Options: { sortBy: 'title'|'author'|'year', order: 'asc'|'desc' }
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
      const dir = (order && String(order).toLowerCase() === 'desc') ? -1 : 1;
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
   * List books by publication year range.
   * Behavior: inclusive bounds; accepts string numeric bounds; if start > end they are swapped; books with missing/null year are included; results sorted by year descending (nulls last).
   * @param {number|string|null|undefined} start
   * @param {number|string|null|undefined} end
   * @returns {Array<Book>} array of Book instances
   */
  listByYear(start, end) {
    let s = Book.normalizeYear(start);
    let e = Book.normalizeYear(end);

    // if both bounds provided and out of order, swap
    if (s !== null && e !== null && s > e) { const tmp = s; s = e; e = tmp; }

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
   * Return simple stats about the collection.
   */
  stats() {
    const total = this.books.length;
    const read = this.books.reduce((s, b) => s + (b.read ? 1 : 0), 0);
    return { total, read, unread: total - read };
  }

  /**
   * Import books from an array of plain objects.
   * options: { skipDuplicates: true }
   * Returns { added, skipped }
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
        if (!title || !author) { skipped++; continue; }
        const exists = this.books.some((b) => b.title.toLowerCase() === title.toLowerCase() && b.author.toLowerCase() === author.toLowerCase());
        if (exists && skipDuplicates) { skipped++; continue; }
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
   * Export collection to a file (JSON). Returns true on success.
   */
  exportToFile(filePath) {
    if (!filePath || typeof filePath !== 'string') throw new Error('filePath required');
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.books.map((b) => b.toJSON()), null, 2), 'utf8');
    return true;
  }

  /**
   * Find first book with exact title match (case-insensitive). Returns null if not found.
   */
  findBookByTitle(title) {
    if (!title || typeof title !== 'string') return null;
    const search = title.trim().toLowerCase();
    return this.books.find((b) => b && b.title && b.title.toLowerCase() === search) || null;
  }

  /**
   * Update a book identified by title. Allowed updates: title, author, year, read.
   * Returns the updated book or null if not found.
   */
  updateBook(title, updates = {}) {
    const book = this.findBookByTitle(title);
    if (!book) return null;
    const newTitle = updates.title ? String(updates.title).trim() : book.title;
    const newAuthor = updates.author ? String(updates.author).trim() : book.author;
    // If title/author changed, ensure no duplicate would be created
    const duplicate = this.books.some((b) => b !== book && b.title.toLowerCase() === newTitle.toLowerCase() && b.author.toLowerCase() === newAuthor.toLowerCase());
    if (duplicate) throw new Error('update would create duplicate book');

    if (updates.title) book.title = newTitle;
    if (updates.author) book.author = newAuthor;
    if (Object.prototype.hasOwnProperty.call(updates, 'year')) book.year = Book.normalizeYear(updates.year);
    if (Object.prototype.hasOwnProperty.call(updates, 'read')) book.read = Boolean(updates.read);
    this.saveBooks();
    return book;
  }

  /**
   * Mark a book (found by title) as read. Returns true if changed, false if not found or already read.
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
   * Remove a book by title. Returns true if removed, false if not found.
   *
   * Supports optional second parameter to disambiguate or control behavior:
   * - removeBook(title, 'Author Name') to remove by title+author
   * - removeBook(title, { author: 'Author Name', removeAll: true, normalize: false })
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
   * Find books by author. Performs case-insensitive substring match.
   */
  findByAuthor(author) {
    if (!author || typeof author !== 'string') return [];
    const a = author.trim().toLowerCase();
    return this.books.filter((b) => b && b.author && b.author.toLowerCase().includes(a));
  }

  /**
   * Search books by query across specified fields. Supported fields: title, author, year, read.
   * options: { fields?: string[], limit?: number }
   */
  search(query, options = {}) {
    if (!query || typeof query !== 'string') return [];
    if (!query || typeof query !== 'string') return [];
    const q = query.trim();
    if (q === '') return [];
    const fields = Array.isArray(options.fields) && options.fields.length > 0 ? options.fields.map((f) => f.toLowerCase()) : ['title', 'author'];
    const normalized = q.toLowerCase();
    const results = [];
      for (const b of this.books) {
      if (!b) continue;
      let matched = false;
      for (const field of fields) {
        if (field === 'title' && b.title && b.title.toLowerCase().includes(normalized)) { matched = true; break; }
        if (field === 'author' && b.author && b.author.toLowerCase().includes(normalized)) { matched = true; break; }
        if (field === 'year' && b.year !== null && String(b.year) === q) { matched = true; break; }
        if (field === 'read') {
          const qBool = (normalized === 'true' || normalized === 'false') ? (normalized === 'true') : null;
          if (qBool !== null && b.read === qBool) { matched = true; break; }
        }
      }
      if (matched) results.push(b);
      if (options.limit && results.length >= Number(options.limit)) break;
    }
    return results;
  }
}

module.exports = { Book, BookCollection, DATA_FILE };