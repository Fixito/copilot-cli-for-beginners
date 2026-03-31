/**
 * Print the main menu for the Book Collection App.
 * @returns {void}
 */
function printMenu() {
  console.log('\n📚 Book Collection App');
  console.log('1. Add a book');
  console.log('2. List books');
  console.log('3. Mark book as read');
  console.log('4. Remove a book');
  console.log('5. Exit');
}

/**
 * Print a list of books to the console.
 * @param {Array<{title:string,author:string,year:(number|string|undefined),read:boolean}>} books - Array of book objects.
 * @returns {void}
 */
function printBooks(books) {
  try {
    if (!Array.isArray(books) || books.length === 0) {
      console.log('No books in your collection.');
      return;
    }

    console.log('\nYour Books:');
    books.forEach((book, index) => {
      if (!book || typeof book !== 'object') {
        console.warn(`Skipping invalid book entry at index ${index}`);
        return;
      }

      const title = book.title ?? 'Untitled';
      const author = book.author ?? 'Unknown';
      const year = book.year ?? 'n/a';
      const status = book.read ? '✅ Read' : '📖 Unread';

      console.log(`${index + 1}. ${title} by ${author} (${year}) - ${status}`);
    });
  } catch (err) {
    // Defensive: log error but don't rethrow to calling code
    console.error('Error printing books:', err && err.message ? err.message : err);
  }
}

module.exports = { printMenu, printBooks };
