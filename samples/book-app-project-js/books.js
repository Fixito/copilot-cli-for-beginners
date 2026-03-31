const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

class Book {
  constructor(title, author, year, read = false) {
    this.title = title;
    this.author = author;
    this.year = year;
    this.read = read;
  }
}

class BookCollection {
  constructor(dataFile) {
    this.dataFile = dataFile || DATA_FILE;
    this.books = [];
    this.loadBooks();
  }

  loadBooks() {
    try {
      const raw = fs.readFileSync(this.dataFile, 'utf-8');
      const data = JSON.parse(raw);
      this.books = data.map((b) => new Book(b.title, b.author, b.year, b.read));
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.books = [];
      } else if (err instanceof SyntaxError) {
        console.log('Warning: data.json is corrupted. Starting with empty collection.');
        this.books = [];
      } else {
        throw err;
      }
    }
  }

  saveBooks() {
    const data = this.books.map((b) => ({
      title: b.title,
      author: b.author,
      year: b.year,
      read: b.read,
    }));
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  addBook(title, author, year) {
    const book = new Book(title, author, year);
    this.books.push(book);
    this.saveBooks();
    return book;
  }

  listBooks() {
    return this.books;
  }

  findBookByTitle(title) {
    return this.books.find((b) => b.title.toLowerCase() === title.toLowerCase()) || null;
  }

  markAsRead(title) {
    const book = this.findBookByTitle(title);
    if (book) {
      book.read = true;
      this.saveBooks();
      return true;
    }
    return false;
  }

  removeBook(title) {
    const book = this.findBookByTitle(title);
    if (book) {
      this.books = this.books.filter((b) => b !== book);
      this.saveBooks();
      return true;
    }
    return false;
  }

  findByAuthor(author) {
    return this.books.filter((b) => b.author.toLowerCase() === author.toLowerCase());
  }

  /**
   * Search books by query across specified fields.
   * @param {string} query
   * @param {{fields?: string[]}} [options]
   * @returns {Book[]}
   */
  search(query, options = {}) {
    try {
      if (!query || typeof query !== 'string') return [];
      const q = query.trim();
      if (q === '') return [];

      const fields = Array.isArray(options.fields) && options.fields.length > 0
        ? options.fields.map((f) => f.toLowerCase())
        : ['title', 'author'];

      const normalized = q.toLowerCase();
      return this.books.filter((b) => {
        if (!b || typeof b !== 'object') return false;
        for (const field of fields) {
          if (field === 'title' && b.title && b.title.toLowerCase().includes(normalized)) return true;
          if (field === 'author' && b.author && b.author.toLowerCase().includes(normalized)) return true;
        }
        return false;
      });
    } catch (err) {
      // Defensive: return empty on unexpected errors
      return [];
    }
  }
}

module.exports = { Book, BookCollection, DATA_FILE };
