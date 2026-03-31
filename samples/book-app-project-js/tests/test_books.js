const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BookCollection } = require('../books');
const { handleMarkAsReadCLI } = require('../book_app');

let tempFile;

beforeEach(() => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'book-test-'));
  tempFile = path.join(tempDir, 'data.json');
  fs.writeFileSync(tempFile, '[]');
});

describe('BookCollection', () => {
  it('should add a book', () => {
    const collection = new BookCollection(tempFile);
    const initialCount = collection.books.length;
    collection.addBook('1984', 'George Orwell', 1949);
    assert.equal(collection.books.length, initialCount + 1);
    const book = collection.findBookByTitle('1984');
    assert.notEqual(book, null);
    assert.equal(book.author, 'George Orwell');
    assert.equal(book.year, 1949);
    assert.equal(book.read, false);
  });

  it('should mark a book as read', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Dune', 'Frank Herbert', 1965);
    const result = collection.markAsRead('Dune');
    assert.equal(result, true);
    const book = collection.findBookByTitle('Dune');
    assert.equal(book.read, true);
  });

  it('should return false when marking a nonexistent book as read', () => {
    const collection = new BookCollection(tempFile);
    const result = collection.markAsRead('Nonexistent Book');
    assert.equal(result, false);
  });

  it('should remove a book', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('The Hobbit', 'J.R.R. Tolkien', 1937);
    const result = collection.removeBook('The Hobbit');
    assert.equal(result, true);
    const book = collection.findBookByTitle('The Hobbit');
    assert.equal(book, null);
  });

  it('should return false when removing a nonexistent book', () => {
    const collection = new BookCollection(tempFile);
    const result = collection.removeBook('Nonexistent Book');
    assert.equal(result, false);
  });

  it('should mark a book as read via CLI handler', async () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Dune', 'Frank Herbert', 1965);
    const result = await handleMarkAsReadCLI('Dune', tempFile);
    assert.equal(result, true);
    collection.loadBooks();
    const book = collection.findBookByTitle('Dune');
    assert.equal(book.read, true);
  });

  it('should add and compute average rating', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Dune', 'Frank Herbert', 1965);
    collection.addReview('Dune', 5, 'Great book');
    collection.addReview('Dune', 3, 'Okay');
    const reviews = collection.listReviews('Dune');
    assert.equal(reviews.length, 2);
    const avg = collection.getAverageRating('Dune');
    assert.equal(avg, 4);
  });

  it('should add review via CLI-like method', async () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Dune', 'Frank Herbert', 1965);
    // simulate CLI handler by calling addReview directly
    collection.addReview('Dune', 4, 'Nice');
    collection.loadBooks();
    const book = collection.findBookByTitle('Dune');
    assert.equal(book.reviews.length, 1);
    assert.equal(book.reviews[0].rating, 4);
  });

  it('should search books by title (partial, case-insensitive)', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('The Hobbit', 'J.R.R. Tolkien', 1937);
    collection.addBook('A Brief History of Time', 'Stephen Hawking', 1988);
    const results = collection.search('hob', { fields: ['title'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'The Hobbit');
  });

  it('should search books by author (partial, case-insensitive)', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Dune', 'Frank Herbert', 1965);
    collection.addBook('Children of Dune', 'Frank Herbert', 1976);
    const results = collection.search('frank', { fields: ['author'] });
    assert.equal(results.length, 2);
  });

  it('should return no results for empty query', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('1984', 'George Orwell', 1949);
    const results = collection.search('', { fields: ['title', 'author'] });
    assert.equal(results.length, 0);
  });

  it('should list books by year range (inclusive), include null-year entries and sort by year desc', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Old Book', 'Author1', 1980);
    collection.addBook('Mid Book', 'Author2', 1995);
    collection.addBook('New Book', 'Author3', 2010);
    collection.addBook('Mystery Book', 'Author4', null);
    const results = collection.listByYear('1980', '2010');
    assert.equal(results.length, 4);
    assert.equal(results[0].title, 'New Book');
    assert.equal(results[1].title, 'Mid Book');
    assert.equal(results[2].title, 'Old Book');
    assert.equal(results[3].title, 'Mystery Book');
  });

  it('should handle swapped bounds and accept string bounds', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('A', 'a', 1990);
    collection.addBook('B', 'b', 2000);
    const results = collection.listByYear(2000, '1990');
    assert.equal(results.length, 2);
    assert.equal(results[0].year, 2000);
    assert.equal(results[1].year, 1990);
  });

  it('should support open-ended bounds', () => {
    const collection = new BookCollection(tempFile);
    collection.addBook('Before', 'One', 1980);
    collection.addBook('After', 'Two', 2020);
    const res1 = collection.listByYear(2000, null);
    assert.equal(res1.length, 1);
    assert.equal(res1[0].title, 'After');
    const res2 = collection.listByYear(null, 1990);
    assert.equal(res2.length, 1);
    assert.equal(res2[0].title, 'Before');
  });

});
