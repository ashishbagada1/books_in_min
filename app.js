require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { admin, db } = require('./config/firebase-admin');
const cors = require('cors');
const puppeteer = require('puppeteer');

// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://book-in-minutes.vercel.app',
            'http://localhost:3000'
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

const app = express();

app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// Trust proxy (required for secure cookies to work behind a proxy)
app.set('trust proxy', 1);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    try {
        const user = await admin.auth().getUser(req.session.userId);
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        req.session.destroy();
        res.redirect('/');
    }
};

// Session check endpoint
app.get('/auth/check-session', (req, res) => {
    console.log('Session check - userId:', req.session.userId);
    res.json({ 
        valid: !!req.session.userId,
        isAdmin: req.session.isAdmin || false
    });
});

// Search API endpoint
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.json([]);
        }

        // Convert query to lowercase for case-insensitive search
        const lowercaseQuery = query.toLowerCase();

        // Get books collection reference
        const booksRef = db.collection('books');
        
        // Get all books (we'll filter in memory for better search)
        const snapshot = await booksRef.get();
        
        // Filter and map books
        const results = [];
        snapshot.forEach(doc => {
            const book = doc.data();
            // Search in title and author
            if (book.title?.toLowerCase().includes(lowercaseQuery) || 
                book.author?.toLowerCase().includes(lowercaseQuery)) {
                results.push({
                    id: doc.id,
                    title: book.title || '',
                    author: book.author || '',
                    description: book.description || ''
                });
            }
        });

        // Sort results by relevance (exact matches first)
        results.sort((a, b) => {
            const aTitle = a.title.toLowerCase();
            const bTitle = b.title.toLowerCase();
            const aStartsWith = aTitle.startsWith(lowercaseQuery);
            const bStartsWith = bTitle.startsWith(lowercaseQuery);
            
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            return 0;
        });

        // Limit results
        res.json(results.slice(0, 10));
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login');
});

app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login');
});

// Home route with auth check
app.get('/home', requireAuth, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/');
        }
        
      // Get books collection
const booksRef = db.collection('books');
const snapshot = await booksRef.orderBy('createdAt', 'desc').get();

const books = [];
// Use async/await loop
for (const doc of snapshot.docs) {
    const bookData = doc.data();
    // Fetch prices for each book
    const prices = await fetchPrices(bookData.amazonUrl, bookData.flipkartUrl);
    
    books.push({ 
        id: doc.id, 
        ...bookData,
        prices // Add prices to the book object
    });
}

        const user = await admin.auth().getUser(req.session.userId);
        const customClaims = user.customClaims || {};
        const isAdmin = customClaims.admin === true;
        
        res.render('home', { user, books, isAdmin });
    } catch (error) {
        console.error('Error in home route:', error);
        res.redirect('/');
    }
});

// Book detail page
app.get('/book/:id', requireAuth, async (req, res) => {
    try {
        const bookId = req.params.id;
        if (!bookId) {
            console.error('No book ID provided');
            return res.redirect('/home');
        }

        const bookRef = db.collection('books').doc(bookId);
        const doc = await bookRef.get();
        
        if (!doc.exists) {
            console.error(`Book with ID ${bookId} not found`);
            return res.redirect('/home');
        }

        const bookData = { id: doc.id, ...doc.data() };
        const user = await admin.auth().getUser(req.session.userId);
        const customClaims = user.customClaims || {};

        // Default placeholder image
        const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjIyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjIyMCIgZmlsbD0iI2YwZjBmMCIvPjxwYXRoIGQ9Ik02NSA5MGg0MHYxMEg2NXpNNTUgMTEwaDYwdjEwSDU1ek01NSAxMzBoNjB2MTBINTZ6IiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iODAiIHk9IjcwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPk5vIENvdmVyPC90ZXh0Pjwvc3ZnPg==';

        console.log('Rendering book details for:', bookId);
        console.log('Book data:', bookData);

        res.render('book-details', { 
            user,
            book: bookData,
            isAdmin: customClaims.admin === true,
            PLACEHOLDER_IMAGE
        });
    } catch (error) {
        console.error('Error fetching book details:', error);
        res.redirect('/home');
    }
});

// Auth endpoints
app.post('/auth/session', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            console.error('Session creation failed: No ID token provided');
            return res.status(400).json({ 
                success: false,
                error: 'No ID token provided' 
            });
        }

        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            console.log('Token decoded successfully:', { uid: decodedToken.uid });
            
            // Set session data
            req.session.userId = decodedToken.uid;
            
            // Check if user has admin claim
            const user = await admin.auth().getUser(decodedToken.uid);
            req.session.isAdmin = user.customClaims && user.customClaims.admin === true;

            // Save session explicitly
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error:', err);
                        reject(err);
                    } else {
                        console.log('Session saved successfully');
                        resolve();
                    }
                });
            });

            res.json({ 
                success: true, 
                isAdmin: req.session.isAdmin
            });
        } catch (tokenError) {
            console.error('Token verification failed:', tokenError);
            res.status(401).json({ 
                success: false,
                error: 'Invalid token',
                details: tokenError.message
            });
        }
    } catch (error) {
        console.error('Session creation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            res.status(500).json({ error: 'Failed to logout' });
        } else {
            res.json({ success: true });
        }
    });
});

// API Routes
app.use('/admin', require('./routes/adminRoutes'));
app.use(require('./routes/bookRoutes'));

// ... (Tumhara purana code yahan tak hai)

// --- NEW CODE STARTS HERE (Paste this before 'const PORT') ---

/// --- PUPPETER HELPER FUNCTIONS START ---

async function fetchPrices(amazonUrl, flipkartUrl) {
    const prices = { amazon: null, flipkart: null };
    
    if (amazonUrl) {
        prices.amazon = await fetchAmazonPrice(amazonUrl);
    }
    if (flipkartUrl) {
        prices.flipkart = await fetchFlipkartPrice(flipkartUrl);
    }
    
    return prices;
}

async function fetchAmazonPrice(url) {
    try {
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] // Extra args added for stability
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
        
        const priceElement = await page.$('.a-price-whole');
        let price = null;
        
        if (priceElement) {
            price = await page.evaluate(el => el.textContent.replace(/[^\d.]/g, ''), priceElement);
            price = parseFloat(price);
        }

        await browser.close();
        return price;
    } catch (error) {
        console.error('Amazon fetch error:', error.message);
        return null;
    }
}

async function fetchFlipkartPrice(url) {
    try {
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
        
        const priceElement = await page.$('._30jeq3');
        let price = null;
        
        if (priceElement) {
            price = await page.evaluate(el => el.textContent.replace(/[^\d.]/g, ''), priceElement);
            price = parseFloat(price);
        }

        await browser.close();
        return price;
    } catch (error) {
        console.error('Flipkart fetch error:', error.message);
        return null;
    }
}

// --- PUPPETER HELPER FUNCTIONS END ---


// --- NEW CODE ENDS HERE ---



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});