document.addEventListener('DOMContentLoaded', () => {
    // Initialize modals and global variables
    const deleteModal = document.getElementById('deleteModal');
    const searchBooksModal = document.getElementById('searchBooksModal');
    let deleteCallback = null;
    let currentUserId = null;

    // Close modal function
    const closeModals = () => {
        deleteModal.style.display = 'none';
        searchBooksModal.style.display = 'none';
        deleteCallback = null;
        currentUserId = null;
    };

    // Close buttons for modals
    document.querySelectorAll('.modal .close, .modal .btn-secondary[data-dismiss="modal"]').forEach(button => {
        button.addEventListener('click', closeModals);
    });

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            closeModals();
        }
    });

    // Confirm delete button
    document.getElementById('confirmDelete').addEventListener('click', async () => {
        if (deleteCallback && currentUserId) {
            await deleteCallback(currentUserId);
            closeModals();
        }
    });

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('data-section');
            
            // Update active states
            navItems.forEach(nav => nav.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(targetSection).classList.add('active');
        });
    });

    // Load initial data
    loadDashboardStats();
    loadUsers();
    loadBooks();

    // Book Management
    const bulkSearchInput = document.getElementById('bulkSearchInput');
    const searchBooksBtn = document.getElementById('searchBooksBtn');
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const searchResultsActions = document.getElementById('searchResultsActions');
    const applyAllBtn = document.getElementById('applyAllBtn');
    const addAllBooksBtn = document.getElementById('addAllBooksBtn');
    const additionSuccess = document.getElementById('additionSuccess');
    const addedBooksCount = document.getElementById('addedBooksCount');
    const booksListTable = document.getElementById('booksListTable');

    // Default placeholder image as base64
    const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjIyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjIyMCIgZmlsbD0iI2YwZjBmMCIvPjxwYXRoIGQ9Ik02NSA5MGg0MHYxMEg2NXpNNTUgMTEwaDYwdjEwSDU1ek01NSAxMzBoNjB2MTBINTZ6IiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iODAiIHk9IjcwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPk5vIENvdmVyPC90ZXh0Pjwvc3ZnPg==';

    // Open Library API Key
    const OPEN_LIBRARY_API_KEY = 'YOUR_OPEN_LIBRARY_API_KEY'; // Replace with your API key

    // Manual book addition form
    const addBookForm = `
        <form id="manualBookForm" class="manual-book-form">
            <div class="form-group">
                <label for="manualTitle">Title*</label>
                <input type="text" id="manualTitle" required>
            </div>
            <div class="form-group">
                <label for="manualAuthor">Author*</label>
                <input type="text" id="manualAuthor" required>
            </div>
            <div class="form-group">
                <label for="manualDescription">Description</label>
                <textarea id="manualDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label for="manualImage">Image URL</label>
                <input type="url" id="manualImage">
            </div>
            <div class="form-group">
                <label for="manualAmazon">Amazon URL</label>
                <input type="url" id="manualAmazon">
            </div>
            <div class="form-group">
                <label for="manualFlipkart">Flipkart URL</label>
                <input type="url" id="manualFlipkart">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Add Book</button>
            </div>
        </form>
    `;

    // Add book button click handler
    document.getElementById('addBookBtn').addEventListener('click', () => {
        const modalContent = searchBooksModal.querySelector('.modal-content');
        
        modalContent.innerHTML = `
            <div class="modal-header">
                <h2>Add New Book</h2>
                <span class="close">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="bulkSearchInput">Search Books</label>
                    <textarea id="bulkSearchInput" 
                             rows="3" 
                             placeholder="Enter book titles (one per line)&#10;Example:&#10;The Lord of the Rings | J.R.R. Tolkien"></textarea>
                </div>
                <button id="searchBooksBtn" class="btn btn-primary">Search Books</button>
            </div>
        `;

        // Show modal
        searchBooksModal.style.display = 'block';

        // Add event listeners
        modalContent.querySelector('.close').addEventListener('click', () => {
            searchBooksModal.style.display = 'none';
        });

        // Search button click handler
        modalContent.querySelector('#searchBooksBtn').addEventListener('click', async () => {
            const searchInput = modalContent.querySelector('#bulkSearchInput');
            const titles = searchInput.value.trim().split('\n').filter(line => line.trim());
            
            if (!titles.length) {
                showError('Please enter at least one book title');
                return;
            }

            showLoader('Searching books...');
            
            // Create or get the search results container in the main content area
            let searchResultsContainer = document.querySelector('#mainSearchResults');
            if (!searchResultsContainer) {
                searchResultsContainer = document.createElement('div');
                searchResultsContainer.id = 'mainSearchResults';
                searchResultsContainer.className = 'search-results-container';
                
                // Find or create the necessary containers
                let mainContainer = document.querySelector('main');
                if (!mainContainer) {
                    mainContainer = document.createElement('main');
                    document.body.appendChild(mainContainer);
                }
                
                let contentContainer = document.querySelector('.content');
                if (!contentContainer) {
                    contentContainer = document.createElement('div');
                    contentContainer.className = 'content';
                    mainContainer.appendChild(contentContainer);
                }
                
                // Try to insert before books grid, fallback to appending to content
                const booksGrid = contentContainer.querySelector('.books-grid');
                if (booksGrid) {
                    contentContainer.insertBefore(searchResultsContainer, booksGrid);
                } else {
                    contentContainer.appendChild(searchResultsContainer);
                }
            }
            searchResultsContainer.innerHTML = '<h2>Search Results</h2>';

            let successfulSearches = 0;
            let failedSearches = 0;

            try {
                for (const line of titles) {
                    const [title, author] = line.split('|').map(s => s.trim());
                    const query = `${title}${author ? ` ${author}` : ''}`;

                    try {
                        const response = await fetch('/admin/search-books', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ query })
                        });

                        if (!response.ok) {
                            throw new Error('Search failed');
                        }

                        const books = await response.json();
                        if (books && books.length > 0) {
                            successfulSearches++;
                            books.forEach(book => {
                                const bookCard = document.createElement('div');
                                bookCard.className = 'search-result';
                                bookCard.dataset.bookId = book.openLibraryId;
                                
                                bookCard.innerHTML = `
                                    <div class="book-image">
                                        <img src="${book.imageUrl || PLACEHOLDER_IMAGE}" 
                                             alt="${book.title}"
                                             onerror="this.src='${PLACEHOLDER_IMAGE}'">
                                    </div>
                                    <div class="book-info">
                                        <h3>${book.title}</h3>
                                        <p class="author">by ${book.author}</p>
                                        <p class="description">${
                                            book.description ? 
                                            book.description.substring(0, 200) + (book.description.length > 200 ? '...' : '') : 
                                            'No description available'
                                        }</p>
                                        <p class="details">
                                            ${book.publishedDate ? `Published: ${book.publishedDate}<br>` : ''}
                                            ${book.pageCount ? `Pages: ${book.pageCount}` : ''}
                                        </p>
                                    </div>
                                    <div class="book-actions">
                                        <button class="btn btn-primary add-book" onclick="addBookToDatabase(${
                                            JSON.stringify({
                                                title: book.title,
                                                author: book.author,
                                                description: book.description,
                                                imageUrl: book.imageUrl,
                                                publishedDate: book.publishedDate,
                                                pageCount: book.pageCount,
                                                openLibraryId: book.openLibraryId
                                            }).replace(/"/g, '&quot;')
                                        })">
                                            Add Book
                                        </button>
                                    </div>
                                `;
                                
                                searchResultsContainer.appendChild(bookCard);
                            });
                        } else {
                            failedSearches++;
                        }
                    } catch (error) {
                        console.error(`Search failed for "${title}":`, error);
                        failedSearches++;
                    }
                }

                // Close the modal after search
                searchBooksModal.style.display = 'none';

                if (failedSearches > 0) {
                    showError(`Failed to find ${failedSearches} book(s). Please check the titles and try again.`);
                }
            } catch (error) {
                console.error('Search error:', error);
                showError('Failed to search books');
            } finally {
                hideLoader();
            }
        });
    });

    // Function to fetch book store links
    async function fetchBookStoreLinks(title, author) {
        try {
            const searchQuery = `${title} ${author || ''}`.trim();
            showLoader('Searching store links...');
            
            const response = await fetch('/admin/fetch-book-links', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ searchQuery })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch store links');
            }

            const data = await response.json();
            hideLoader();
            return {
                amazonUrl: data.amazon,
                flipkartUrl: data.flipkart
            };
        } catch (error) {
            console.error('Store links error:', error);
            hideLoader();
            // Return search URLs as fallback
            const fallbackQuery = encodeURIComponent(`${title} book`);
            return {
                amazonUrl: `https://www.amazon.in/s?k=${fallbackQuery}&i=stripbooks`,
                flipkartUrl: `https://www.flipkart.com/search?q=${fallbackQuery}&type=books`
            };
        }
    }

    // Add book to database function - make it globally available
    window.addBookToDatabase = async function(bookData) {
        try {
            showLoader('Adding book...');
            
            // Fetch store links first
            const storeLinks = await fetchBookStoreLinks(bookData.title, bookData.author);
            
            // Combine book data with store links
            const completeBookData = {
                ...bookData,
                amazonUrl: storeLinks.amazonUrl,
                flipkartUrl: storeLinks.flipkartUrl
            };

            const response = await fetch('/admin/books', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(completeBookData)
            });

            if (!response.ok) {
                throw new Error('Failed to add book');
            }

            const result = await response.json();
            showSuccess('Book added successfully!');
            return result;
        } catch (error) {
            console.error('Add book error:', error);
            showError('Failed to add book: ' + error.message);
            throw error;
        } finally {
            hideLoader();
        }
    };

    // Update the editBook function to use the new store links function
    window.editBook = async function(id) {
        try {
            showLoader('Loading book details...');
            
            // Fetch book details
            const response = await fetch(`/admin/books/${id}`, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch book details');
            }

            const book = await response.json();
            
            // Fetch store links
            const storeLinks = await fetchBookStoreLinks(book.title, book.author);
            
            // Update book data with store URLs
            const updatedBook = {
                ...book,
                amazonUrl: storeLinks.amazonUrl,
                flipkartUrl: storeLinks.flipkartUrl
            };

            // Show edit modal with the updated data
            showEditModal(updatedBook);
        } catch (error) {
            console.error('Edit book error:', error);
            showError('Failed to load book details');
        } finally {
            hideLoader();
        }
    };

    async function searchAmazon(title) {
        try {
            const searchQuery = `${title.trim()} book`;
            const response = await fetch('/admin/search-amazon', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ searchQuery })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.url || `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
            }
            return `https://www.amazon.in/s?k=${encodeURIComponent(title + ' book')}`;
        } catch (error) {
            console.error('Amazon search failed:', error);
            return `https://www.amazon.in/s?k=${encodeURIComponent(title + ' book')}`;
        }
    }

    async function searchFlipkart(title) {
        try {
            const searchQuery = `${title.trim()} book`;
            const response = await fetch('/admin/search-flipkart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ searchQuery })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.url || `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}`;
            }
            return `https://www.flipkart.com/search?q=${encodeURIComponent(title + ' book')}`;
        } catch (error) {
            console.error('Flipkart search failed:', error);
            return `https://www.flipkart.com/search?q=${encodeURIComponent(title + ' book')}`;
        }
    }

    // Add deleteAllBooks function
    async function deleteAllBooks() {
        try {
            // Show confirmation dialog
            const confirmDelete = await showConfirmDialog(
                'Delete All Books',
                'Are you sure you want to delete ALL books? This action cannot be undone!'
            );
            
            if (!confirmDelete) return;
            
            showLoader('Deleting all books...');
            
            const response = await fetch('/admin/books/delete-all', {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            console.log('Delete all result:', result);

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to delete books');
            }

            // Clear the books table immediately
            const tbody = document.getElementById('booksList');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No books found</td></tr>';
            }

            // Remove delete all button
            const deleteAllBtn = document.querySelector('.delete-all-btn');
            if (deleteAllBtn) {
                deleteAllBtn.remove();
            }

            // Update total books count
            const totalBooksElement = document.getElementById('totalBooks');
            if (totalBooksElement) {
                totalBooksElement.textContent = '0';
            }

            showSuccess(result.message || 'All books deleted successfully');
        } catch (error) {
            console.error('Delete all books error:', error);
            showError('Failed to delete books: ' + error.message);
            // Refresh the books list to ensure UI is in sync
            await loadBooks();
        } finally {
            hideLoader();
        }
    }

    // Confirmation dialog function
    function showConfirmDialog(title, message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${title}</h2>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                        <button class="btn btn-danger" data-action="confirm">Delete All</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            function cleanup() {
                if (document.body.contains(modal)) {
                    document.body.removeChild(modal);
                }
            }
            
            // Handle button clicks
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('close') || 
                    e.target.getAttribute('data-action') === 'cancel') {
                    cleanup();
                    resolve(false);
                } else if (e.target.getAttribute('data-action') === 'confirm') {
                    cleanup();
                    resolve(true);
                }
            });
            
            // Handle ESC key
            document.addEventListener('keydown', function handler(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handler);
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    // Update loadBooks function to handle empty state better
    async function loadBooks() {
        try {
            const fetchOptions = {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            console.log('Fetching books...');
            const response = await fetch('/admin/books', {
                ...fetchOptions,
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const books = await response.json();
            console.log('Books loaded:', books);

            const booksTable = document.getElementById('booksListTable');
            if (!booksTable) {
                console.error('Books table element not found. Make sure you are on the books section.');
                return;
            }
            
            // Handle delete all button
            let deleteAllBtn = document.querySelector('.delete-all-btn');
            
            if (books.length > 0) {
                if (!deleteAllBtn) {
                    deleteAllBtn = document.createElement('button');
                    deleteAllBtn.className = 'btn btn-danger delete-all-btn';
                    deleteAllBtn.innerHTML = '<i class="fas fa-trash"></i> Delete All Books';
                    deleteAllBtn.onclick = deleteAllBooks;
                    booksTable.parentNode.insertBefore(deleteAllBtn, booksTable);
                }
            } else if (deleteAllBtn) {
                deleteAllBtn.remove();
            }
            
            const tbody = document.getElementById('booksList');
            if (!tbody) {
                console.error('Books list tbody not found');
                return;
            }
            
            tbody.innerHTML = '';
            
            if (books.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No books found</td></tr>';
                
                // Update total books count
                const totalBooksElement = document.getElementById('totalBooks');
                if (totalBooksElement) {
                    totalBooksElement.textContent = '0';
                }
                return;
            }
            
            books.forEach(book => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <img src="${book.imageUrl || '/images/default-book-cover.jpg'}" 
                             alt="${book.title}" 
                             class="book-thumbnail"
                             onerror="this.src='/images/default-book-cover.jpg'">
                    </td>
                    <td>${book.title || ''}</td>
                    <td>${book.author || ''}</td>
                    <td>${new Date(book.createdAt).toLocaleDateString()}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-primary btn-sm" onclick="editBook('${book.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteBook('${book.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Update total books count
            const totalBooksElement = document.getElementById('totalBooks');
            if (totalBooksElement) {
                totalBooksElement.textContent = books.length;
            }
        } catch (error) {
            console.error('Error loading books:', error);
            showError('Failed to load books. Please try refreshing the page.');
        }
    }

    // Make sure to load books when switching to books section
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            if (section === 'books') {
                loadBooks();
            }
        });
    });

    // Initial load if we're on books section
    if (window.location.hash === '#books') {
        loadBooks();
    }

    // Helper function to show success message
    function showSuccess(message) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-success';
        alert.textContent = message;
        document.querySelector('.content').insertBefore(alert, document.querySelector('.content').firstChild);
        
        setTimeout(() => {
            alert.remove();
        }, 3000);
    }

    // Delay function for rate limiting
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Apply all details button
    applyAllBtn.addEventListener('click', () => {
        const editButtons = document.querySelectorAll('.edit-toggle');
        editButtons.forEach(btn => btn.classList.toggle('show'));
    });

    // Load Data Functions
    async function loadDashboardStats() {
        try {
            const [usersResponse, booksResponse] = await Promise.all([
                fetch('/admin/users'),
                fetch('/admin/books')
            ]);

            const users = await usersResponse.json();
            const books = await booksResponse.json();

            document.getElementById('totalUsers').textContent = users.length;
            document.getElementById('totalBooks').textContent = books.length;
        } catch (error) {
            console.error('Load stats error:', error);
            showError('Failed to load dashboard stats');
        }
    }

    async function loadUsers() {
        try {
            showLoader('Loading users...');
            const response = await fetch('/admin/users');
            const users = await response.json();
            
            const usersList = document.getElementById('usersList');
            usersList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.email}</td>
                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>${new Date(user.lastLogin).toLocaleDateString()}</td>
                    <td>
                        <span class="status-badge ${user.active ? 'active' : 'inactive'}">
                            ${user.active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
            hideLoader();
        } catch (error) {
            console.error('Error loading users:', error);
            hideLoader();
            showError('Failed to load users');
        }
    }

    window.deleteBook = async function(id) {
        if (!confirm('Are you sure you want to delete this book?')) {
            return;
        }

        try {
            showLoader('Deleting book...');
            const response = await fetch(`/admin/books/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete book');
            }

            await loadBooks();
            await loadDashboardStats();
            hideLoader();
        } catch (error) {
            console.error('Delete book error:', error);
            hideLoader();
            showError(error.message);
        }
    };

    window.deleteUser = (id) => {
        if (!deleteModal) {
            console.error('Delete modal not found');
            return;
        }

        currentUserId = id;
        deleteModal.style.display = 'block';
        
        deleteCallback = async (userId) => {
            try {
                showLoader('Deleting user...');
                const response = await fetch(`/admin/users/${userId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete user');
                }

                await loadUsers(); // Refresh users list
                await loadDashboardStats(); // Update dashboard stats
                showSuccess('User deleted successfully');
            } catch (error) {
                console.error('Delete user error:', error);
                showError(error.message);
            } finally {
                hideLoader();
            }
        };
    };

    // UI Helper Functions
    function showLoader(message = 'Loading...') {
        const loader = document.querySelector('.loader-container');
        const loaderText = loader.querySelector('.loader-text');
        loaderText.textContent = message;
        loader.classList.remove('hide');
    }

    function hideLoader() {
        document.querySelector('.loader-container').classList.add('hide');
    }

    function showError(message) {
        // You can implement a toast or alert system here
        alert(message);
    }

    function showSuccess(message) {
        // You can implement a toast or alert system here
        alert(message);
    }

    // Mobile menu functionality
    const mobileMenuBtn = document.querySelector('.mobile-menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');
    const sidebarNavItems = document.querySelectorAll('.sidebar .nav-item');

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }

    // Mobile menu button click
    mobileMenuBtn?.addEventListener('click', toggleSidebar);

    // Overlay click
    overlay?.addEventListener('click', toggleSidebar);

    // Close sidebar when nav item is clicked on mobile
    sidebarNavItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                toggleSidebar();
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Function to render search results
    function renderSearchResults(books) {
        const searchResultsGrid = document.getElementById('searchResultsGrid');
        const searchResultsActions = document.getElementById('searchResultsActions');
        
        if (!searchResultsGrid || !searchResultsActions) return;
        
        searchResultsGrid.innerHTML = '';
        searchResultsActions.classList.remove('hide');
        
        if (!books || books.length === 0) {
            searchResultsGrid.innerHTML = '<div class="no-results">No books found</div>';
            searchResultsActions.classList.add('hide');
            return;
        }
        
        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card-search';
            card.innerHTML = `
                <div class="card-header">
                    <div class="store-links">
                        ${book.amazonUrl ? `
                            <a href="${book.amazonUrl}" target="_blank" class="amazon-link">
                                <i class="fab fa-amazon"></i> View on Amazon
                            </a>
                        ` : ''}
                        ${book.flipkartUrl ? `
                            <a href="${book.flipkartUrl}" target="_blank" class="flipkart-link">
                                <i class="fas fa-shopping-cart"></i> View on Flipkart
                            </a>
                        ` : ''}
                    </div>
                </div>
                <div class="book-image">
                    <img src="${book.imageUrl || '/images/default-book-cover.jpg'}" 
                         alt="${book.title}"
                         onerror="this.src='/images/default-book-cover.jpg'">
                </div>
                <div class="book-details">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">${book.author ? `By ${book.author}` : ''}</p>
                    <p class="book-description">${book.description || 'No description available.'}</p>
                </div>
                <div class="card-footer">
                    <div class="action-buttons">
                        <button class="btn btn-add" onclick="addBookToDatabase(${JSON.stringify(book).replace(/"/g, '&quot;')})">
                            <i class="fas fa-plus"></i> Add Book
                        </button>
                        <button class="btn btn-edit" onclick="editBookDetails(${JSON.stringify(book).replace(/"/g, '&quot;')})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                </div>
            `;
            searchResultsGrid.appendChild(card);
        });
        
        // Show actions bar with total count
        const addedBooksCount = document.getElementById('addedBooksCount');
        if (addedBooksCount) {
            addedBooksCount.textContent = '0';
        }
        
        // Show apply all and add all buttons
        const actionButtons = searchResultsActions.querySelector('.action-buttons');
        if (actionButtons) {
            actionButtons.classList.remove('hide');
        }
        
        // Hide success message initially
        const successMessage = document.getElementById('additionSuccess');
        if (successMessage) {
            successMessage.classList.add('hide');
        }
    }

    // Function to show loading state for a card
    function showCardLoading(card) {
        card.classList.add('loading');
    }

    // Function to hide loading state for a card
    function hideCardLoading(card) {
        card.classList.remove('loading');
    }
});