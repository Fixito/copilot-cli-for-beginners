'use strict';
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

/**
 * Simple Book model with lightweight validation and JSON serialization.
 */
class Book {
  constructor(title, author, year = null, read = false) {
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
  }

  static normalizeYear(year) {
    if (year === undefined || year === null || year === '') return null;
    const n = Number(year);
    if (Number.isNaN(n) || !Number.isInteger(n)) return null;
    return n;
  }

  toJSON() {
    return {
      title: this.title,
      author: this.author,
      year: this.year,
      read: this.read,
    };
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
          if (!title || !author) {
            // skip invalid legacy entries but don't fail the whole load
            console.warn('Skipping invalid book entry in data file:', entry);
            continue;
          }
          this.books.push(new Book(title, author, year, read));
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
        if (!title || !author) { skipped++; continue; }
        const exists = this.books.some((b) => b.title.toLowerCase() === title.toLowerCase() && b.author.toLowerCase() === author.toLowerCase());
        if (exists && skipDuplicates) { skipped++; continue; }
        this.books.push(new Book(title, author, year, read));
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
   */
  removeBook(title) {
    const book = this.findBookByTitle(title);
    if (!book) return false;
    this.books = this.books.filter((b) => b !== book);
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
