document.addEventListener('DOMContentLoaded', () => {
    // Hide loader after page loads
    setTimeout(() => {
        document.querySelector('.loader-container').classList.add('hide');
    }, 2000);

    // Form elements
    const authContainer = document.querySelector('.auth-container');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupBtn = document.getElementById('showSignup');
    const showLoginBtn = document.getElementById('showLogin');
    const auth = firebase.auth();

    // Switch between login and signup forms
    showSignupBtn?.addEventListener('click', () => {
        authContainer.classList.add('show-signup');
    });

    showLoginBtn?.addEventListener('click', () => {
        authContainer.classList.remove('show-signup');
    });

    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    });

    // Login form submission
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            showLoader('Logging you in...');
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const idToken = await userCredential.user.getIdToken();
            await createSession(idToken);
        } catch (error) {
            console.error('Login error:', error);
            hideLoader();
            showError(error.message);
        }
    });

    // Signup form submission
    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            showError("Passwords don't match!");
            return;
        }

        try {
            showLoader('Creating your account...');
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const idToken = await userCredential.user.getIdToken();
            await createSession(idToken);
        } catch (error) {
            console.error('Signup error:', error);
            hideLoader();
            showError(error.message);
        }
    });

    // Google Sign In
    document.querySelectorAll('.btn-google').forEach(button => {
        button.addEventListener('click', async () => {
            try {
                showLoader('Logging you in with Google...');
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({
                    prompt: 'select_account'
                });
                const result = await auth.signInWithPopup(provider);
                const idToken = await result.user.getIdToken(true);
                await createSession(idToken);
            } catch (error) {
                console.error('Google sign-in error:', error);
                hideLoader();
                showError(error.message || 'Failed to sign in with Google');
            }
        });
    });

    // Firebase Authentication State
    let isProcessingAuth = false;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user && !isProcessingAuth) {
            try {
                isProcessingAuth = true;
                console.log('Auth state changed - user:', user.email);
                
                // Check current path
                const currentPath = window.location.pathname;
                if (currentPath !== '/' && currentPath !== '/login' && currentPath !== '/home') {
                    return;
                }
                
                // Check if we already have a valid session
                try {
                    const sessionResponse = await fetch('/auth/check-session', {
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });

                    if (sessionResponse.ok) {
                        const sessionData = await sessionResponse.json();
                        console.log('Session check response:', sessionData);
                        
                        if (sessionData.valid) {
                            console.log('Valid session found, redirecting...');
                            if (currentPath === '/' || currentPath === '/login') {
                                window.location.href = '/home';
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.log('Session check failed:', error);
                }

                console.log('Creating new session...');
                const idToken = await user.getIdToken(true);
                await createSession(idToken);
                
            } catch (error) {
                console.error('Authentication state error:', error);
                showError(`Authentication failed: ${error.message}`);
                await firebase.auth().signOut();
            } finally {
                isProcessingAuth = false;
            }
        } else if (!user) {
            // User is not logged in
            const currentPath = window.location.pathname;
            if (currentPath !== '/' && currentPath !== '/login') {
                window.location.href = '/';
            }
        }
    });

    // Logout functionality
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.onclick = async () => {
            try {
                await firebase.auth().signOut();
                await fetch('/auth/logout', { method: 'POST' });
                window.location.href = '/login';
            } catch (error) {
                console.error('Logout error:', error);
                showError('Failed to logout');
            }
        };
    }

    // Admin Authentication Modal
    const adminAuthModal = document.getElementById('adminAuthModal');
    const adminAuthBtn = document.getElementById('adminAuthBtn');
    const closeButtons = document.querySelectorAll('.close, .close-modal');
    const adminAuthError = document.getElementById('adminAuthError');

    if (adminAuthBtn && adminAuthModal) {
        // Open modal
        adminAuthBtn.onclick = () => {
            adminAuthModal.style.display = 'block';
            adminAuthError.textContent = '';
        };

        // Close modal
        closeButtons.forEach(button => {
            button.onclick = () => {
                adminAuthModal.style.display = 'none';
                adminAuthError.textContent = '';
            };
        });

        // Close on outside click
        window.onclick = (e) => {
            if (e.target === adminAuthModal) {
                adminAuthModal.style.display = 'none';
                adminAuthError.textContent = '';
            }
        };
    }

    // Admin Authentication
    const adminAuthForm = document.getElementById('adminAuthForm');
    if (adminAuthForm) {
        adminAuthForm.onsubmit = async (e) => {
            e.preventDefault();
            const adminPassword = document.getElementById('adminPassword').value;
            
            try {
                showLoader('Verifying admin access...');
                const user = firebase.auth().currentUser;
                if (!user) {
                    throw new Error('Please login first');
                }

                const idToken = await user.getIdToken();
                const response = await fetch('/admin/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ password: adminPassword })
                });

                const data = await response.json();
                if (response.ok) {
                    window.location.href = '/admin/dashboard';
                } else {
                    throw new Error(data.error || 'Admin verification failed');
                }
            } catch (error) {
                console.error('Admin auth error:', error);
                hideLoader();
                adminAuthError.textContent = error.message;
            }
        };
    }

    // Create session with backend
    async function createSession(idToken) {
        try {
            console.log('Creating session with token...');
            const response = await fetch('/auth/session', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ idToken })
            });

            const data = await response.json();
            console.log('Session response:', data);
            
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to create session');
            }

            // Hide loader before redirect
            hideLoader();
            
            // Manually navigate to home
            window.location.href = '/home';
            
        } catch (error) {
            console.error('Session creation failed:', error);
            hideLoader();
            showError(error.message);
            throw error;
        }
    }

    // Helper functions
    function showLoader(message = 'Loading...') {
        const loader = document.createElement('div');
        loader.id = 'loader';
        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <div class="loader-message">${message}</div>
        `;
        document.body.appendChild(loader);
    }

    function hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.remove();
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }
});