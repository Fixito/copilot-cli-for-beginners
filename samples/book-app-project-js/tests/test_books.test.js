/* Comprehensive tests focused on BookCollection.addBook
 * Placed at samples/book-app-project-js/tests/test_books.js per request.
 * Uses Node's built-in test runner (node:test) and node:assert.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Book, BookCollection } = require('../books');

let tempFile;
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-test-'));
  tempFile = path.join(tempDir, 'data.json');
  fs.writeFileSync(tempFile, '[]');
});

// cleanup helper
function cleanup() {
  try {
    if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
}

describe('BookCollection.addBook (comprehensive)', () => {
  afterEach(() => cleanup());

  it('creates a Book, trims title/author, normalizes year and saves to disk', () => {
    const coll = new BookCollection(tempFile);
    const book = coll.addBook('  The Hobbit  ', '  J.R.R. Tolkien  ', '1937');

    assert.ok(book instanceof Book);
    assert.strictEqual(book.title, 'The Hobbit');
    assert.strictEqual(book.author, 'J.R.R. Tolkien');
    assert.strictEqual(book.year, 1937);
    assert.strictEqual(coll.books.length, 1);

    // verify on-disk persistence
    const raw = fs.readFileSync(tempFile, 'utf8');
    const arr = JSON.parse(raw);
    assert.strictEqual(Array.isArray(arr), true);
    assert.strictEqual(arr[0].title, 'The Hobbit');
  });

  it('throws when title is missing or invalid', () => {
    const coll = new BookCollection(tempFile);
    assert.throws(() => coll.addBook('', 'Author'), /title is required/);
    assert.throws(() => coll.addBook(null, 'Author'), /title is required/);
    assert.strictEqual(coll.books.length, 0);
  });

  it('throws when author is missing or invalid', () => {
    const coll = new BookCollection(tempFile);
    assert.throws(() => coll.addBook('Title', ''), /author is required/);
    assert.throws(() => coll.addBook('Title', null), /author is required/);
    assert.strictEqual(coll.books.length, 0);
  });

  it('detects duplicates case-insensitively and with trimming', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Foo', 'Bar', 2000);
    assert.throws(() => coll.addBook('  foo  ', 'bar'), /book already exists/);
    assert.strictEqual(coll.books.length, 1);
  });

  it('normalizes year: accepts integers and numeric strings, rejects floats', () => {
    const coll = new BookCollection(tempFile);
    const b1 = coll.addBook('One', 'Author', 1999);
    assert.strictEqual(b1.year, 1999);

    const b2 = coll.addBook('Two', 'Author2', '2001');
    assert.strictEqual(b2.year, 2001);

    const b3 = coll.addBook('Three', 'Author3', '2001.5');
    assert.strictEqual(b3.year, null);
  });

  it('persists books and duplicate detection works after reload', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Persist', 'Author', 2005);

    const coll2 = new BookCollection(tempFile);
    assert.throws(() => coll2.addBook('persist', 'author'), /book already exists/);
  });

  it('multiple adds maintain order and data integrity', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('A', 'AuthorA', 1990);
    coll.addBook('B', 'AuthorB', 2000);
    coll.addBook('C', 'AuthorC', null);

    assert.strictEqual(coll.books.length, 3);
    assert.strictEqual(coll.findBookByTitle('A').author, 'AuthorA');
    assert.strictEqual(coll.findBookByTitle('B').year, 2000);
    assert.strictEqual(coll.findBookByTitle('C').year, null);
  });

  // --- Additional addBook-specific tests (non-destructive, reuse same tempFile) ---
  it('rejects duplicates across instances (file-backed)', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Unique', 'Author', 2010);
    const coll2 = new BookCollection(tempFile);
    assert.throws(() => coll2.addBook('unique', 'author'), /book already exists/);
  });

  it('trims whitespace-only titles and authors and treats as invalid', () => {
    const coll = new BookCollection(tempFile);
    assert.throws(() => coll.addBook('   ', 'Author'), /title is required/);
    assert.throws(() => coll.addBook('Title', '   '), /author is required/);
  });

  // --- removeBook tests ---
  it('removeBook removes exact title and preserves partial titles', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Dune', 'Frank Herbert');
    coll.addBook('Dune Messiah', 'Frank Herbert');
    const ok = coll.removeBook('Dune');
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(coll.books.map(b => b.title), ['Dune Messiah']);
  });

  it('removeBook does not remove partial matches when exact not found', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Dune Messiah', 'Frank Herbert');
    const ok = coll.removeBook('Dune');
    assert.strictEqual(ok, false);
    assert.deepStrictEqual(coll.books.map(b => b.title), ['Dune Messiah']);
  });

  it('removeBook can remove specific book when titles duplicate but authors differ', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Common Title', 'Author A');
    coll.addBook('Common Title', 'Author B');
    const ok = coll.removeBook('Common Title', 'Author B');
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(coll.books.map(b => `${b.title}:::${b.author}`), ['Common Title:::Author A']);
  });

  it('removeBook is case-insensitive: removing "dune" removes "Dune"', () => {
    const coll = new BookCollection(tempFile);
    coll.addBook('Dune', 'Frank Herbert');
    const ok = coll.removeBook('dune');
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(coll.books.map(b => b.title), []);
  });

  it('removeBook on empty collection returns false', () => {
    const coll = new BookCollection(tempFile);
    // ensure empty
    assert.strictEqual(coll.books.length, 0);
    const ok = coll.removeBook('Any Title');
    assert.strictEqual(ok, false);
  });

});
