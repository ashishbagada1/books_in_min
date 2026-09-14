document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    const logoutBtn = document.getElementById('logoutButton'); 
    const auth = firebase.auth();
    const loader = document.querySelector('.loader-container');
    const searchInput = document.getElementById('searchInput');
    const booksGrid = document.querySelector('.books-grid');
    
    console.log('Elements found:', {
        searchInput: !!searchInput,
        booksGrid: !!booksGrid,
        logoutBtn: !!logoutBtn
    });

    let debounceTimer;

    function showLoader(message) {
        const loaderText = loader.querySelector('.loader-text');
        if (loaderText) {
            loaderText.textContent = message;
        }
        loader.classList.remove('hide');
    }

    function hideLoader() {
        loader.classList.add('hide');
    }

    // Function to show no results message
    function showNoResults(show) {
        console.log('Showing no results:', show);
        let noResultsEl = document.querySelector('.no-results-message');
        if (!noResultsEl && show) {
            noResultsEl = document.createElement('div');
            noResultsEl.className = 'no-results-message';
            noResultsEl.textContent = 'No books found';
            booksGrid.appendChild(noResultsEl);
        } else if (noResultsEl && !show) {
            noResultsEl.remove();
        }
    }

    // Function to filter books
    const filterBooks = (query) => {
        console.log('Filtering books with query:', query);
        const searchTerm = query.toLowerCase().trim();
        const bookCards = booksGrid.querySelectorAll('.book-card'); 
        console.log('Found book cards:', bookCards.length);
        
        let hasResults = false;

        if (!searchTerm) {
            bookCards.forEach(card => card.style.display = '');
            showNoResults(false);
            return;
        }

        bookCards.forEach(card => {
            const titleEl = card.querySelector('.book-info h3');
            const authorEl = card.querySelector('.book-info .author');
            
            console.log('Card elements:', {
                titleEl: !!titleEl,
                authorEl: !!authorEl
            });
            
            const title = titleEl?.textContent.toLowerCase() || '';
            const author = authorEl?.textContent.toLowerCase() || '';
            
            console.log('Searching in:', { title, author });
            
            if (title.includes(searchTerm) || author.includes(searchTerm)) {
                card.style.display = '';
                hasResults = true;
                console.log('Match found:', title);
            } else {
                card.style.display = 'none';
            }
        });

        showNoResults(!hasResults);
    };

    // Debounce function
    const debounce = (func, delay) => {
        return (...args) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // Add event listener to search input
    const debouncedSearch = debounce((e) => {
        console.log('Search input value:', e.target.value);
        filterBooks(e.target.value);
    }, 300);

    // Add search event listener
    if (searchInput) {
        console.log('Adding search input listener');
        searchInput.addEventListener('input', debouncedSearch);
    } else {
        console.error('Search input not found!');
    }

    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                showLoader('Logging out...');
                await auth.signOut();
                window.location.href = '/';
            } catch (error) {
                hideLoader();
                alert('Error logging out. Please try again.');
            }
        });
    }
});
