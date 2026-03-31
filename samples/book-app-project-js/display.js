'use strict';

/**
 * Display helpers for the Book Collection App.
 * Centralize formatting and printing so UI is consistent.
 */

function formatRating(avg) {
  if (avg === null || avg === undefined) return 'No rating';
  if (typeof avg === 'number' && Number.isFinite(avg)) return `Avg: ${avg.toFixed(2)}`;
  return 'No rating';
}

function formatBookLine(book, index) {
  const status = book && book.read ? '✅' : '📖';
  const year = book && (book.year === null || book.year === undefined || book.year === '') ? 'n/a' : book.year;
  const avg = book && typeof book.averageRating === 'function' ? book.averageRating() : null;
  const ratingStr = formatRating(avg);
  const title = book && book.title ? book.title : 'Untitled';
  const author = book && book.author ? book.author : 'Unknown';
  return `${index + 1}. [${status}] ${title} by ${author} (${year}) - ${ratingStr}`;
}

function printBooks(books) {
  try {
    if (!Array.isArray(books) || books.length === 0) {
      console.log('No books found.');
      return;
    }

    console.log('\nYour Book Collection:\n');
    books.forEach((book, index) => {
      if (!book || typeof book !== 'object') {
        console.warn(`Skipping invalid book entry at index ${index}`);
        return;
      }
      console.log(formatBookLine(book, index));
    });
    console.log();
  } catch (err) {
    console.error('Error printing books:', err && err.message ? err.message : err);
  }
}

function printReviews(reviews, title) {
  try {
    if (!Array.isArray(reviews) || reviews.length === 0) {
      console.log('\nNo reviews found.\n');
      return;
    }
    const heading = title ? `Reviews for ${title}:` : 'Reviews:';
    console.log(`\n${heading}\n`);
    reviews.forEach((r, i) => {
      const text = r && r.text ? r.text : '';
      console.log(`${i}. Rating: ${r && r.rating ? r.rating : 'N/A'} — ${text}`);
    });
    console.log();
  } catch (err) {
    console.error('Error printing reviews:', err && err.message ? err.message : err);
  }
}

module.exports = { formatBookLine, formatRating, printBooks, printReviews };