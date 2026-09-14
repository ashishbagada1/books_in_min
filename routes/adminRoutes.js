const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase-admin');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');

// Admin verification
router.post('/verify', async (req, res) => {
    try {
        const { password } = req.body;
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const user = await admin.auth().getUser(decodedToken.uid);

        // Verify admin password
        if (password !== process.env.ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Invalid admin password' });
        }

        // Set admin claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        
        // Update session
        req.session.userId = user.uid;
        req.session.isAdmin = true;

        res.json({ success: true });
    } catch (error) {
        console.error('Admin verification error:', error);
        res.status(500).json({ error: 'Admin verification failed' });
    }
});

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.session.userId || !req.session.isAdmin) {
            if (req.accepts('html')) {
                return res.redirect('/');
            }
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await admin.auth().getUser(req.session.userId);
        const customClaims = user.customClaims || {};
        
        if (!customClaims.admin) {
            if (req.accepts('html')) {
                return res.redirect('/');
            }
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        next();
    } catch (error) {
        console.error('Admin check error:', error);
        if (req.accepts('html')) {
            return res.redirect('/');
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Apply admin check to all routes except verification
router.use((req, res, next) => {
    if (req.path === '/verify') {
        return next();
    }
    requireAdmin(req, res, next);
});

// Admin dashboard page
router.get('/dashboard', (req, res) => {
    res.render('admin/dashboard', { 
        user: req.session.userId,
        isAdmin: true 
    });
});

// Fetch book links with direct product URLs
router.post('/fetch-book-links', async (req, res) => {
    try {
        const { searchQuery } = req.body;
        const cleanQuery = searchQuery.trim() + ' book';
        const encodedQuery = encodeURIComponent(cleanQuery);

        // Function to get Amazon book link
        async function getAmazonBookLink(query) {
            try {
                // First get search results
                const searchResponse = await axios.get(`https://www.amazon.in/s?k=${query}&i=stripbooks`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const $ = cheerio.load(searchResponse.data);
                
                // Find the first book result
                const bookLink = $('a.a-link-normal.s-no-outline').first().attr('href');
                
                if (!bookLink) return null;
                
                // Get the full product page
                const productUrl = `https://www.amazon.in${bookLink}`;
                const productResponse = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const product$ = cheerio.load(productResponse.data);
                
                // Verify it's a book by checking for ISBN
                const isBook = product$('#detailBullets_feature_div').text().toLowerCase().includes('isbn');
                
                return isBook ? productUrl : null;
            } catch (error) {
                console.error('Amazon fetch error:', error);
                return null;
            }
        }

        // Function to get Flipkart book link
        async function getFlipkartBookLink(query) {
            try {
                // First get search results
                const searchResponse = await axios.get(`https://www.flipkart.com/search?q=${query}&type=books`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const $ = cheerio.load(searchResponse.data);
                
                // Find the first book result
                const bookLink = $('a._1fQZEK').first().attr('href');
                
                if (!bookLink) return null;
                
                // Get the full product page
                const productUrl = `https://www.flipkart.com${bookLink}`;
                const productResponse = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                const product$ = cheerio.load(productResponse.data);
                
                // Verify it's a book by checking product details
                const isBook = product$('.row._2-riNZ').text().toLowerCase().includes('isbn');
                
                return isBook ? productUrl : null;
            } catch (error) {
                console.error('Flipkart fetch error:', error);
                return null;
            }
        }

        // Fetch both links in parallel with a timeout
        const timeout = 10000; // 10 seconds timeout
        const [amazonLink, flipkartLink] = await Promise.all([
            Promise.race([
                getAmazonBookLink(encodedQuery),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Amazon timeout')), timeout)
                )
            ]).catch(() => null),
            Promise.race([
                getFlipkartBookLink(encodedQuery),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Flipkart timeout')), timeout)
                )
            ]).catch(() => null)
        ]);

        // If no direct links found, return search URLs as fallback
        const response = {
            amazon: amazonLink || `https://www.amazon.in/s?k=${encodedQuery}&i=stripbooks`,
            flipkart: flipkartLink || `https://www.flipkart.com/search?q=${encodedQuery}&type=books`
        };

        console.log('Book links found:', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching book links:', error);
        res.status(500).json({ 
            error: 'Failed to fetch book links',
            details: error.message 
        });
    }
});

// Rate limiter for API endpoints
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiter to book link fetching
router.use('/fetch-book-links', limiter);

// Get all books
router.get('/books', requireAdmin, async (req, res) => {
    try {
        console.log('Fetching books...');
        const booksRef = db.collection('books');
        const snapshot = await booksRef.orderBy('createdAt', 'desc').get();
        
        const books = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            books.push({
                id: doc.id,
                title: data.title || '',
                author: data.author || '',
                description: data.description || '',
                imageUrl: data.imageUrl || '',
                amazonUrl: data.amazonUrl || '',
                flipkartUrl: data.flipkartUrl || '',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString()
            });
        });
        
        console.log(`Found ${books.length} books`);
        res.json(books);
    } catch (error) {
        console.error('Error getting books:', error);
        res.status(500).json({ error: 'Failed to get books' });
    }
});

// Get single book
router.get('/books/:id', async (req, res) => {
    try {
        const bookId = req.params.id;
        const bookRef = db.collection('books').doc(bookId);
        const doc = await bookRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Book not found' });
        }

        res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({ error: 'Failed to get book' });
    }
});

// Update book
router.put('/books/:id', async (req, res) => {
    try {
        const bookId = req.params.id;
        const bookData = req.body;
        
        // Remove undefined fields
        Object.keys(bookData).forEach(key => 
            bookData[key] === undefined && delete bookData[key]
        );

        await db.collection('books').doc(bookId).update({
            ...bookData,
            updatedAt: new Date().toISOString()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({ error: 'Failed to update book' });
    }
});

// Create book
router.post('/books', async (req, res) => {
    try {
        const bookData = {
            ...req.body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await db.collection('books').add(bookData);
        res.json({ id: docRef.id, ...bookData });
    } catch (error) {
        console.error('Add book error:', error);
        res.status(500).json({ error: 'Failed to add book' });
    }
});

// Delete book
router.delete('/books/:id', async (req, res) => {
    try {
        await db.collection('books').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting book:', error);
        res.status(500).json({ error: 'Failed to delete book' });
    }
});

// Delete all books
router.delete('/books/delete-all', requireAdmin, async (req, res) => {
    try {
        console.log('Starting delete all books operation...');
        
        // Get reference to books collection
        const booksRef = admin.firestore().collection('books');
        
        // Get all books
        const snapshot = await booksRef.get();
        
        if (snapshot.empty) {
            console.log('No books to delete');
            return res.json({ 
                success: true, 
                message: 'No books to delete',
                count: 0 
            });
        }

        const count = snapshot.size;
        console.log(`Found ${count} books to delete`);

        // Delete each document
        const deletePromises = snapshot.docs.map(async (doc) => {
            console.log(`Deleting book: ${doc.id}`);
            try {
                await admin.firestore().collection('books').doc(doc.id).delete();
                console.log(`Deleted book: ${doc.id}`);
            } catch (error) {
                console.error(`Error deleting book ${doc.id}:`, error);
                throw error;
            }
        });

        // Wait for all deletions to complete
        await Promise.all(deletePromises);
        
        console.log('Successfully deleted all books');
        res.json({
            success: true,
            message: `Successfully deleted ${count} books`,
            count: count
        });
    } catch (error) {
        console.error('Delete all books error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete all books',
            details: error.message
        });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const listUsers = await admin.auth().listUsers();
        const users = listUsers.users.map(user => ({
            id: user.uid,
            email: user.email,
            createdAt: user.metadata.creationTime,
            lastLogin: user.metadata.lastSignInTime,
            active: !user.disabled
        }));
        res.json(users);
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // Don't allow admin to delete themselves
        if (userId === req.session.userId) {
            return res.status(400).json({ 
                error: 'Cannot delete your own admin account' 
            });
        }

        // Check if user exists before deletion
        try {
            await admin.auth().getUser(userId);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                return res.status(404).json({ 
                    error: 'User not found',
                    code: error.code
                });
            }
            throw error;
        }

        // Delete user from Firebase Auth
        await admin.auth().deleteUser(userId);

        // Delete any associated user data (if you have any)
        try {
            await db.collection('users').doc(userId).delete();
        } catch (error) {
            console.warn('No user document to delete:', error);
        }

        res.json({ 
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            error: 'Failed to delete user',
            code: error.code,
            message: error.message
        });
    }
});

// Search Open Library
router.post('/search-books', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        // Search Open Library
        const encodedQuery = encodeURIComponent(query);
        const searchResponse = await axios.get(`https://openlibrary.org/search.json?q=${encodedQuery}&limit=10`);

        if (!searchResponse.data.docs || searchResponse.data.docs.length === 0) {
            return res.json([]);
        }

        const books = await Promise.all(searchResponse.data.docs.slice(0, 5).map(async book => {
            try {
                let bookData = {
                    openLibraryId: book.key?.split('/').pop() || '',
                    title: book.title || 'Unknown Title',
                    author: book.author_name?.[0] || 'Unknown Author',
                    publishedDate: book.first_publish_year || '',
                    imageUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null
                };

                // Get additional book details if available
                if (book.key) {
                    try {
                        const detailsResponse = await axios.get(`https://openlibrary.org${book.key}.json`);
                        bookData.description = detailsResponse.data.description?.value || 
                                             detailsResponse.data.description || 
                                             'No description available';
                        bookData.pageCount = detailsResponse.data.number_of_pages;
                    } catch (error) {
                        console.error('Failed to fetch book details:', error);
                        bookData.description = 'No description available';
                    }
                }

                return bookData;
            } catch (error) {
                console.error('Error processing book:', error);
                return null;
            }
        }));

        // Filter out any null results from errors
        const validBooks = books.filter(book => book !== null);
        res.json(validBooks);

    } catch (error) {
        console.error('Open Library search error:', error);
        res.status(500).json({ 
            error: 'Failed to search books',
            details: error.response?.data?.message || error.message 
        });
    }
});

// Add book
router.post('/add-book-from-google', async (req, res) => {
    try {
        const bookData = {
            ...req.body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await db.collection('books').add(bookData);
        res.json({ id: docRef.id, ...bookData });
    } catch (error) {
        console.error('Add book error:', error);
        res.status(500).json({ error: 'Failed to add book' });
    }
});

// Search Amazon for book
router.post('/search-amazon', async (req, res) => {
    try {
        const { searchQuery } = req.body;
        // Here you would implement Amazon product search
        // For now, returning a search URL
        res.json({ url: `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}` });
    } catch (error) {
        console.error('Amazon search error:', error);
        res.status(500).json({ error: 'Failed to search Amazon' });
    }
});

// Search Flipkart for book
router.post('/search-flipkart', async (req, res) => {
    try {
        const { searchQuery } = req.body;
        // Here you would implement Flipkart product search
        // For now, returning a search URL
        res.json({ url: `https://www.flipkart.com/search?q=${encodeURIComponent(searchQuery)}` });
    } catch (error) {
        console.error('Flipkart search error:', error);
        res.status(500).json({ error: 'Failed to search Flipkart' });
    }
});

module.exports = router;