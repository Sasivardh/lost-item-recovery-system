const API_URL = '/api';

let currentItems = [];
let currentFilter = 'all';

// No login required — use a default guest user
let currentUser = JSON.parse(localStorage.getItem('diet_user')) || null;

// Initial Redirection Gate
if (!currentUser && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
}

let bannerBase64 = null;
let currentReceiptId = null;
let currentReceiptTimestamp = null;

async function loadBanner() {
  try {
    const response = await fetch('./banner.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        bannerBase64 = reader.result;
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Banner not loaded:', e);
    return null;
  }
}

// Call it on page load
window.addEventListener('load', loadBanner);

function toggleAdmin(forceAdmin) {
    const mainApp = document.getElementById('mainApp');
    const adminDashboard = document.getElementById('adminDashboard');
    if (forceAdmin || adminDashboard.style.display === 'none' || adminDashboard.style.display === '') {
        mainApp.style.display = 'none';
        adminDashboard.style.display = 'flex';
        fetchStats();
        renderAdminUsers();
        renderAdminMessages();
    } else {
        adminDashboard.style.display = 'none';
        mainApp.style.display = 'flex';
        fetchItems();
    }
}

async function renderAdminUsers() {
    const tb = document.getElementById('registeredUsersTable');
    const ct = document.getElementById('totalUsersCount');
    if(!tb) return;
    
    try {
        tb.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 15px; color: black;">Connecting to secure directory...</td></tr>';
        const res = await fetch(`${API_URL}/users`);
        const users = await res.json();
        
        if (users.length === 0) {
            tb.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 15px; color: black;">No registered users found in directory.</td></tr>';
            if(ct) ct.innerText = 'Total Members: 0';
            return;
        }

        tb.innerHTML = '';
        users.forEach(user => {
            const row = `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05); color: #333;">
                    <td style="padding: 12px 10px;">${user.name || 'Anonymous'}</td>
                    <td style="padding: 12px 10px; font-family: monospace;">${user.roll || 'N/A'}</td>
                    <td style="padding: 12px 10px;">${user.email}</td>
                    <td style="padding: 12px 10px;">${user.branch || 'N/A'}</td>
                    <td style="padding: 12px 10px;">${user.year || 'N/A'}</td>
                    <td style="padding: 12px 10px;">${user.gender || 'Not Specified'}</td>
                </tr>
            `;
            tb.innerHTML += row;
        });
        
        if(ct) ct.innerText = `Total Registered Members: ${users.length}`;
    } catch (e) {
        console.error('Failed to render users:', e);
        tb.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 15px; color: #e74c3c;">Failed to load user directory. Check server connection.</td></tr>';
    }
}

function writeDebug(msg) {
    console.log(msg);
    const dbg = document.getElementById('debugPane');
    if(dbg) {
        dbg.style.display = 'block';
        dbg.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    }
}

function setUser(user) {
    currentUser = user;
    localStorage.setItem('diet_user', JSON.stringify(user));
    
    // Show/Hide Admin Link
    const adminLink = document.getElementById('adminNavLink');
    if (adminLink) adminLink.style.display = user.role === 'admin' ? 'block' : 'none';
    
    fetchItems();
    fetchStats();
}

function logout() {
    localStorage.removeItem('diet_user');
    window.location.href = 'login.html';
}

function checkAuth() {
    if (!currentUser) {
        window.location.href = 'login.html';
    } else {
        const adminLink = document.getElementById('adminNavLink');
        if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        
        // Advanced System Initializations
        checkIdFoundNotifications();
        updateUnreadBadge();
        setupRealtimeMessages();
    }
}

// PROFILE MANAGEMENT
function openProfile() {
    if (!currentUser) return;
    
    // Populate DISPLAY view
    document.getElementById('dispName').textContent    = currentUser.name || '—';
    document.getElementById('dispEmail').textContent   = currentUser.email || '—';
    document.getElementById('dispMobile').textContent  = currentUser.mobile || '—';
    document.getElementById('dispRoll').textContent    = currentUser.roll || '—';
    document.getElementById('dispBranch').textContent  = currentUser.branch || '—';
    document.getElementById('dispSection').textContent = currentUser.section || '—';
    document.getElementById('dispYear').textContent    = currentUser.year || '—';
    document.getElementById('dispGender').textContent  = currentUser.gender || '—';
    document.getElementById('dispPassword').textContent = '••••••••';
    
    // Always show display, hide edit
    document.getElementById('profileDisplay').style.display = 'block';
    document.getElementById('profileEdit').style.display = 'none';
    
    openModal('profileModal');
}

function toggleProfileEdit(showEdit) {
    document.getElementById('profileDisplay').style.display = showEdit ? 'none' : 'block';
    document.getElementById('profileEdit').style.display = showEdit ? 'block' : 'none';
    
    if (showEdit && currentUser) {
        // Populate EDIT form
        document.getElementById('profName').value    = currentUser.name || '';
        document.getElementById('profMobile').value  = currentUser.mobile || '';
        document.getElementById('profRoll').value    = currentUser.roll || '';
        document.getElementById('profBranch').value  = currentUser.branch || '';
        document.getElementById('profSection').value = currentUser.section || '';
        document.getElementById('profYear').value    = currentUser.year || '';
        document.getElementById('profGender').value  = currentUser.gender || '';
        document.getElementById('profEmail').value   = currentUser.email || '';
        document.getElementById('profPassword').value = ''; // Clear password field for security
    }
}

function saveProfile(event) {
    event.preventDefault();
    if (!currentUser) return;

    const newPassword = document.getElementById('profPassword').value;
    
    const updatedUser = {
        ...currentUser,
        name:    document.getElementById('profName').value.trim(),
        mobile:  document.getElementById('profMobile').value.trim(),
        roll:    document.getElementById('profRoll').value.trim(),
        branch:  document.getElementById('profBranch').value,
        section: document.getElementById('profSection').value.trim(),
        year:    document.getElementById('profYear').value,
        gender:  document.getElementById('profGender').value,
    };

    // Update password if provided
    if (newPassword && newPassword.length >= 4) {
        updatedUser.password = newPassword;
    }
    
    currentUser = updatedUser;
    localStorage.setItem('diet_user', JSON.stringify(updatedUser));
    
    // Always sync with 'lostItemAccounts' to ensure login persistence
    let accounts = JSON.parse(localStorage.getItem('lostItemAccounts') || '{}');
    accounts[currentUser.email] = { ...(accounts[currentUser.email] || {}), ...updatedUser };
    localStorage.setItem('lostItemAccounts', JSON.stringify(accounts));
    
    // Sync to Backend for Admin Directory
    fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
    }).catch(e => console.error('Sync error:', e));

    showToast('✅ Profile Updated Successfully');
    
    // Refresh display view
    openProfile();
}

function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, duration);
}

// Modal handling functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        // Prevent bypassing forced login
        if (event.target.id === 'loginModal' && !currentUser) return;
        event.target.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        const openModals = document.querySelectorAll('.modal.show');
        openModals.forEach(modal => {
            if (modal.id === 'loginModal' && !currentUser) return;
            modal.classList.remove('show');
        });
        
        // Restore scrolling if no modals are open (or only the uncloseable login one is)
        if(document.querySelectorAll('.modal.show:not(#loginModal)').length === 0 && currentUser) {
             document.body.style.overflow = 'auto';
        }
    }
});

function timeSince(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}

// Fetch and render items
async function fetchItems() {
    try {
        const res = await fetch(`${API_URL}/items`);
        currentItems = await res.json();
        renderItems(currentFilter);
    } catch (e) {
        console.error('Failed to fetch items:', e);
        document.getElementById('itemsContainer').innerHTML = '<div style="text-align: center; color: var(--primary-color);">Failed to load items. Make sure backend is running.</div>';
    }
}

function filterItems(type, element) {
    currentFilter = type;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    element.classList.add('active');
    renderItems(currentFilter);
}

function renderItems(filter) {
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';
    
    let filtered = currentItems;
    if (filter === 'my_reports') {
        if (!currentUser) return;
        filtered = currentItems.filter(i => i.reporter_email === currentUser.email);
    } else if (filter !== 'all') {
        filtered = currentItems.filter(i => i.type === filter);
    }
    
    if(filtered.length === 0){
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: black;">No ${filter !== 'all' ? filter : ''} items currently reported.</div>`;
        return;
    }

    filtered.forEach(item => {
        let iconClass = 'fas fa-box';
        if(item.category.includes('Electronics')) iconClass = 'fas fa-laptop';
        else if(item.category.includes('Stationery')) iconClass = 'fas fa-book';
        else if(item.category.includes('Accessories')) iconClass = 'fas fa-wallet';

        const card = document.createElement('div');
        card.className = 'item-card hover-lift';
        card.innerHTML = `
            <div class="item-status status-${item.type}">${item.type.toUpperCase()}</div>
            <div class="item-icon"><i class="${iconClass}"></i></div>
            <div class="item-details">
                <h4>${item.item_name} ${item.status === 'resolved' ? '<span style="color:var(--success-color); font-size:0.8rem; border:1px solid var(--success-color); border-radius:12px; padding:2px 8px; margin-left:10px;"><i class="fas fa-check"></i> RESOLVED</span>' : ''}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${item.location} • <i class="far fa-clock"></i> ${timeSince(item.timestamp || item.date_reported)}</p>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="viewDetails(${item.id})">View Details</button>
                ${(currentUser && item.user_id && item.user_id !== currentUser.id && item.status !== 'resolved') ? 
                    `<button class="btn btn-primary" style="width:100%; justify-content:center;" onclick='openMessageModal(${JSON.stringify(item).replace(/'/g, "&apos;")})'><i class="fas fa-paper-plane"></i> Contact Owner</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function viewDetails(id) {
    const item = currentItems.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById('detailTitle').innerText = item.item_name;
    const content = document.getElementById('detailContent');
    
    let html = `
        <p style="margin-bottom: 15px;"><strong style="color: #111;"><i class="fas fa-tag" style="width: 25px;"></i> Category:</strong><span style="float:right">${item.category}</span></p>
        <p style="margin-bottom: 15px;"><strong style="color: #111;"><i class="fas fa-map-marker-alt" style="width: 25px;"></i> ${item.type === 'lost' ? 'Last Seen' : 'Found At'}:</strong><span style="float:right">${item.location}</span></p>
        <p style="margin-bottom: 15px;"><strong style="color: #111;"><i class="far fa-calendar-alt" style="width: 25px;"></i> Date:</strong><span style="float:right">${item.date_reported || 'N/A'}</span></p>
        <hr style="border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 20px 0;">
    `;
    
    if (item.type === 'lost') {
        html += `<strong style="color: #111;"><i class="fas fa-align-left" style="width: 25px;"></i> Description & Marks:</strong><p style="margin-top: 10px; padding: 10px; background: transparent; border-radius: 8px;">${item.description || 'No specific description provided.'}</p>`;
    } else {
        html += `<strong style="color: #111;"><i class="fas fa-hand-holding" style="width: 25px;"></i> Handed Over To:</strong><p style="margin-top: 10px; padding: 10px; background: transparent; border-radius: 8px;">${item.handed_over_to || 'Not specified'}</p>`;
    }

    if (currentUser && currentUser.email !== item.reporter_email && item.status !== 'resolved') {
        html += `<div style="margin-top: 20px; text-align: center;"><button class="btn btn-secondary slide-hover" onclick="openMessageModal(${item.id})"><i class="fas fa-shield-alt"></i> Securely Contact Reporter</button></div>`;
    } else if (currentUser && currentUser.email === item.reporter_email) {
        html += `<div style="margin-top: 20px; text-align: center; color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> You posted this item.</div>`;
        if (item.status !== 'resolved') {
            html += `<div style="margin-top: 15px; text-align: center;"><button class="btn btn-primary" onclick="resolveItem(${item.id})"><i class="fas fa-flag-checkered"></i> Mark as Resolved (Claimed/Returned)</button></div>`;
        }
    }
    
    // Allow viewing receipt if item is resolved (visible to everyone for transparency)
    if (item.status === 'resolved') {
        html += `<div style="margin-top: 15px; text-align: center;"><button class="btn btn-outline" onclick="viewReceipt('${item.id}', '${item.resolved_timestamp}')"><i class="fas fa-file-invoice"></i> View Official Digital Receipt</button></div>`;
    }
    
    content.innerHTML = html;
    openModal('detailsModal');
}

function viewReceipt(itemId, timestampStr) {
    closeModal('detailsModal');
    // Reconstruct the receipt format
    const formattedTimestamp = timestampStr && timestampStr !== 'null' ? timestampStr : new Date().toISOString().replace('T', ' ').slice(0,19);
    
    currentReceiptId = `REC-${formattedTimestamp.split('-').join('').slice(0,8)}-${itemId}`;
    currentReceiptTimestamp = formattedTimestamp;
    
    document.getElementById('receiptData').innerHTML = `
        <b>Receipt ID:</b> ${currentReceiptId}<br><br>
        <b>Timestamp:</b> ${formattedTimestamp}<br><br>
        <b>Action:</b> Official Handover Recorded<br><br>
        <b>Status:</b> CLOSED & CLEAR
    `;
    openModal('receiptModal');
}



async function resolveItem(itemId) {
    if(!confirm("Are you sure you want to mark this item as resolved? A digital receipt will be generated.")) return;
    
    try {
        const res = await fetch(`${API_URL}/items/${itemId}/resolve`, { method: 'PUT' });
        const data = await res.json();
        
        if (res.ok) {
            closeModal('detailsModal');
            currentReceiptId = data.receipt.receipt_id;
            currentReceiptTimestamp = data.receipt.timestamp;
            document.getElementById('receiptData').innerHTML = `
                <b>Receipt ID:</b> ${currentReceiptId}<br><br>
                <b>Timestamp:</b> ${currentReceiptTimestamp}<br><br>
                <b>Action:</b> Official Handover Resolved<br><br>
                <b>Status:</b> CLOSED & CLEAR
            `;
            openModal('receiptModal');
            fetchItems();
            fetchStats();
        } else {
            showToast('Error resolving item');
        }
    } catch (e) {
        console.error(e);
        showToast('Server error while resolving item.');
    }
}

function openMessageModal(itemId) {
    document.getElementById('messageItemId').value = itemId;
    closeModal('detailsModal');
    openModal('messageModal');
}

async function sendMessage(event) {
    event.preventDefault();
    const itemId = document.getElementById('messageItemId').value;
    const message = document.getElementById('messageText').value;
    const isAnonymous = document.getElementById('messageAnonymous').checked;
    
    if (!message) return;

    try {
        const res = await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                item_id: itemId,
                sender_email: currentUser.email,
                message: message,
                is_anonymous: isAnonymous
            })
        });
        
        if (res.ok) {
            closeModal('messageModal');
            showToast('Message safely relayed to the reporter!');
            event.target.reset();
        } else {
            showToast('Error sending message');
        }
    } catch (e) {
        console.error(e);
        showToast('Server error during messaging.');
    }
}

// Fetch and render stats
async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/stats`);
        const stats = await res.json();
        document.getElementById('lostCount').innerText = stats.lost;
        document.getElementById('foundCount').innerText = stats.found;
        document.getElementById('recoveredCount').innerText = stats.recovered;
        
        // Admin Stats
        const avgTime = document.getElementById('avgRecoveryTime');
        if(avgTime) avgTime.innerText = `${stats.avg_recovery_time_hours}h`;
        
        const topCatsList = document.getElementById('topCategoriesList');
        if(topCatsList) {
            topCatsList.innerHTML = '';
            if (stats.top_lost_categories.length === 0) {
                topCatsList.innerHTML = '<li style="color:black;">No items tracked yet.</li>';
            } else {
                stats.top_lost_categories.forEach((cat, index) => {
                    topCatsList.innerHTML += `<li><b>#${index + 1}</b> - ${cat.category} (${cat.count} lost items)</li>`;
                });
            }
        }
    } catch (e) {
        console.error('Failed to fetch stats:', e);
    }
}

async function submitIdFound(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast('Please login first');
        window.location.href = 'login.html';
        return;
    }

    const rollQuery = document.getElementById('idRollNumber').value.trim().toUpperCase();
    const dropLocation = document.getElementById('idDropLocation').value.trim();
    
    let targetEmail = null;
    let targetName = "Unknown Student";
    
    // Check locally first for UI feedback
    let accounts = JSON.parse(localStorage.getItem('lostItemAccounts') || '{}');
    for (const email in accounts) {
        if (accounts[email].roll && accounts[email].roll.toUpperCase() === rollQuery) {
            targetEmail = email;
            targetName = accounts[email].name;
            break;
        }
    }
    
    const itemData = {
        type: 'found',
        item_name: `Student ID Card (${rollQuery})`,
        category: 'ID Cards',
        date_reported: new Date().toISOString().split('T')[0],
        location: dropLocation,
        description: `URGENT ID RECOVERY: Found student ID card for Roll Number ${rollQuery}. Keep it safe at ${dropLocation}.`,
        handed_over_to: dropLocation,
        reporter_email: currentUser.email,
        user_id: currentUser.id,
        status: 'open'
    };
    
    try {
        console.log('Reporting ID Card:', itemData);
        const response = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(itemData)
        });
        
        if (response.ok) {
            closeModal('idCardModal');
            document.getElementById('idCardForm').reset();
            fetchItems();
            fetchStats();
            
            if (targetEmail) {
                showToast(`✅ SUCCESS! Student found in directory. Ping sent to ${targetName}!`, 6000);
            } else {
                showToast(`✅ ID logged to vault. Student not yet in active directory.`, 5000);
            }
        } else {
            const err = await response.json();
            throw new Error(err.error || 'Submission failed');
        }
    } catch(err) {
        console.error(err);
        alert('System error logging ID card: ' + err.message);
    }
}

// Form submission handling
async function submitForm(event, modalId) {
    event.preventDefault();
    if (!currentUser) {
        showToast('Please login to report items');
        window.location.href = 'login.html';
        return;
    }

    const type = modalId === 'lostModal' ? 'lost' : 'found';
    const form = event.target;
    
    try {
        const payload = {
            type: type,
            item_name: form.querySelector('.item-name').value,
            category: form.querySelector('.item-category').value,
            date_reported: form.querySelector('.item-date').value,
            status: form.querySelector('.item-status').value,        
            reporter_email: currentUser.email,
            user_id: currentUser.id
        };
        
        if(type === 'lost') {
            payload.description = form.querySelector('.item-desc').value;
        } else {
            payload.handed_over_to = form.querySelector('.item-handover').value;
        }

        console.log('Submitting report:', payload);
        const res = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeModal(modalId);
            showToast(type === 'lost' ? '✅ Lost item reported successfully!' : '✅ Found item reported successfully!');
            form.reset();
            
            fetchItems();
            fetchStats();
        } else {
            const errData = await res.json();
            alert("Error reporting item: " + (errData.error || "Unknown server error"));
        }
    } catch (e) {
        console.error('Submission Error:', e);
        alert("Server error. Please check if backend is running (python app.py).");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    const today = new Date().toISOString().split('T')[0];
    dateInputs.forEach(input => {
        input.value = today;
    });

    // Initial auth check
    checkAuth();
    fetchItems();
    fetchStats();
});


async function searchReceipt() {
    const query = document.getElementById('adminReceiptSearch').value.trim().toUpperCase();
    const resultDiv = document.getElementById('adminReceiptResult');
    
    if (!query) {
        showToast("Please enter a Receipt ID");
        return;
    }
    
    // Parse ID: REC-YYYYMMDD-ID
    const parts = query.split('-');
    if (parts.length < 3 || parts[0] !== 'REC') {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="color: #e74c3c;"><i class="fas fa-times-circle"></i> Invalid Receipt Format. Expected format: REC-YYYYMMDD-ID</div>';
        return;
    }
    
    const itemId = parseInt(parts[parts.length - 1]);
    
    try {
        const res = await fetch(`${API_URL}/items`);
        const items = await res.json();
        const item = items.find(i => i.id === itemId);
        
        if (!item) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<div style="color: #e74c3c;"><i class="fas fa-times-circle"></i> No record found for this Receipt ID in the active database.</div>';
            return;
        }
        
        let accounts = JSON.parse(localStorage.getItem('lostItemAccounts') || '{}');
        const reporter = accounts[item.reporter_email];
        
        let reporterHtml = '';
        if (reporter) {
            reporterHtml = `
                <div style="margin-top: 15px;">
                    <h4 style="color: var(--secondary-color); margin-bottom: 10px;"><i class="fas fa-user-check"></i> Reporter Telemetry</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.95rem;">
                        <div><strong>Name:</strong> ${reporter.name}</div>
                        <div><strong>Roll No:</strong> ${reporter.roll}</div>
                        <div><strong>Email:</strong> ${reporter.email}</div>
                        <div><strong>Mobile:</strong> ${reporter.mobile || 'N/A'}</div>
                        <div><strong>Branch:</strong> ${reporter.branch || 'N/A'}</div>
                        <div><strong>Year:</strong> ${reporter.year || 'N/A'}</div>
                    </div>
                </div>
            `;
        } else {
            reporterHtml = `
                <div style="margin-top: 15px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i> Reporter account (${item.reporter_email}) not found in active directory. Profile may be offline.
                </div>
            `;
        }
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <h4 style="color: var(--secondary-color); margin-bottom: 10px;"><i class="fas fa-box"></i> Item Details</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.95rem; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 15px;">
                <div><strong>Item Name:</strong> ${item.item_name}</div>
                <div><strong>Status:</strong> <span style="color: ${item.status === 'resolved' ? 'var(--success-color)' : '#e74c3c'}; font-weight: bold;">${item.status.toUpperCase()}</span></div>
                <div><strong>Category:</strong> ${item.category}</div>
                <div><strong>Type:</strong> ${item.type.toUpperCase()}</div>
                <div style="grid-column: span 2;"><strong>Location:</strong> ${item.location}</div>
                <div style="grid-column: span 2;"><strong>Timestamp:</strong> ${item.timestamp}</div>
            </div>
            ${reporterHtml}
        `;
    } catch (e) {
        showToast("Error connecting to database. Make sure backend is running.");
        console.error(e);
    }
}

async function downloadReceipt() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 15;

  // --- BANNER IMAGE ---
  if (!bannerBase64) await loadBanner();

  if (bannerBase64) {
    const bannerW = contentW;
    const bannerH = 28;
    doc.addImage(bannerBase64, 'PNG', margin, y, bannerW, bannerH);
    y += bannerH + 10;
  } else {
    // Fallback text header if banner fails
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 40, 80);
    doc.text('DHANEKULA INSTITUTE OF ENGINEERING & TECHNOLOGY', pageW / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text('COLLEGE LOST ITEM RECOVERY SYSTEM', pageW / 2, y, { align: 'center' });
    y += 10;
  }

  // --- DIVIDER ---
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // --- GREEN CHECKMARK CIRCLE ---
  doc.setFillColor(39, 174, 96);
  doc.circle(pageW / 2, y + 5, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('✓', pageW / 2, y + 7.5, { align: 'center' });
  y += 20;

  // --- TITLE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(20, 20, 20);
  doc.text('OFFICIAL RESOLUTION LOG', pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // --- RECEIPT DETAILS BOX ---
  const receiptId = currentReceiptId || 
    'REC-' + new Date().toISOString().slice(0,10).replace(/-/g,'') 
    + '-' + Math.floor(1000 + Math.random() * 9000);
  const timestamp = currentReceiptTimestamp || new Date().toISOString();

  const boxH = 55;
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, contentW, boxH, 3, 3, 'FD');

  const labelX = margin + 8;
  const valueX = margin + 42;
  let rowY = y + 13;
  const rowGap = 12;

  const rows = [
    ['Receipt ID:', receiptId],
    ['Timestamp:', timestamp],
    ['Action:', 'Official Handover Recorded'],
    ['Status:', 'CLOSED & CLEAR'],
  ];

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(label, labelX, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(String(value), valueX, rowY);
    rowY += rowGap;
  });

  y += boxH + 12;

  // --- FOOTER ---
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(130, 130, 130);
  doc.text('Generated automatically by DIET Resolution System', pageW / 2, y, { align: 'center' });

  // --- DOWNLOAD ---
  doc.save('DIET-Resolution-Receipt-' + receiptId + '.pdf');
}

async function renderAdminMessages() {
    const feed = document.getElementById('adminMessagesFeed');
    if(!feed) return;
    
    try {
        const res = await fetch(`${API_URL}/messages`);
        const messages = await res.json();
        
        if (messages.length === 0) {
            feed.innerHTML = '<p style="text-align: center; color: #777; padding: 20px;">No message logs recorded yet.</p>';
            return;
        }

        feed.innerHTML = '';
        messages.forEach(msg => {
            let dateStr = 'Unknown Time';
            if(msg.created_at) {
                dateStr = new Date(msg.created_at).toLocaleString();
            }
            const msgHtml = `
                <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid var(--primary-color); box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.85rem; color: #666;">
                        <span><i class="fas fa-paper-plane"></i> From: <b>${msg.sender_email}</b></span>
                        <span><i class="fas fa-clock"></i> ${dateStr}</span>
                    </div>
                    <div style="color: #333; font-size: 0.95rem; margin: 8px 0;">
                        ${msg.message}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--secondary-color); font-weight: bold; border-top: 1px solid #eee; padding-top: 5px; margin-top: 5px;">
                        Relating to Item ID: ${msg.item_id}
                    </div>
                </div>
            `;
            feed.innerHTML += msgHtml;
        });
    } catch (e) {
        console.error('Failed to render messages:', e);
        feed.innerHTML = '<p style="text-align: center; color: #e74c3c; padding: 20px;">Failed to load messages.</p>';
    }
}

async function checkIdFoundNotifications() {
    if (!currentUser || !currentUser.roll) return;
    
    try {
        const res = await fetch(`${API_URL}/items`);
        const items = await res.json();
        
        // Find ID Cards matching the user's roll number
        const myIdItem = items.find(item => 
            (item.category === 'ID Cards' || item.category === 'ID Card') && 
            item.status !== 'recovered' &&
            (item.item_name.includes(currentUser.roll.toUpperCase()) || 
             (item.description && item.description.includes(currentUser.roll.toUpperCase())))
        );

        if (myIdItem) {
            // Use detail modal to show the notification
            const notificationHtml = `
                <div style="background: #fff5f5; border: 2px solid #e74c3c; padding: 20px; border-radius: 12px; margin-top: 10px; color: #333; text-align: center; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.2);">
                    <div style="background: #e74c3c; color: white; width: 60px; height: 60px; line-height: 60px; border-radius: 50%; font-size: 2rem; margin: 0 auto 15px;">
                        <i class="fas fa-id-card"></i>
                    </div>
                    <h3 style="color: #c0392b; margin-bottom: 10px; font-size: 1.4rem;">ID Card Found!</h3>
                    <p style="margin-bottom: 15px; font-weight: 500;">Good news! Someone found your ID card.</p>
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px dashed #e74c3c; text-align: left; font-size: 0.95rem;">
                        <p><strong><i class="fas fa-location-arrow"></i> Collection Point:</strong><br> ${myIdItem. handed_over_to || myIdItem.location || 'College Security Vault'}</p>
                    </div>
                    <p style="margin-top: 15px; font-size: 0.85rem; color: #666;">Please carry another ID proof to verify and collect.</p>
                    <button class="btn btn-primary" onclick="closeModal('detailsModal')" style="margin-top: 20px; width: 100%; justify-content: center; background: #e74c3c; border-color: #e74c3c;">Understood, Thank You!</button>
                </div>
            `;
            
            // Populate details modal for unique notification
            document.getElementById('detailTitle').textContent = "📢 Recovery Notification";
            document.getElementById('detailContent').innerHTML = notificationHtml;
            openModal('detailsModal');
        }
    } catch (e) {
        console.error('Notification check failed:', e);
    }
}

// ADVANCED MESSAGING SYSTEM
function openMessageModal(itemOrId) {
    if (!currentUser) {
        showToast("Please login to contact the owner");
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    
    let item = itemOrId;
    if (typeof itemOrId === 'number' || typeof itemOrId === 'string') {
        item = currentItems.find(i => i.id == itemOrId);
    }
    
    if (!item) {
        showToast("Error: Item details not found.");
        return;
    }

    document.getElementById('msgItemId').value = item.id || '';
    document.getElementById('msgReceiverId').value = item.user_id || '';
    document.getElementById('msgModalItemName').textContent = `Contact Owner: ${item.item_name}`;
    document.getElementById('msgTextarea').value = '';
    openModal('messageModal');
}

async function handleSendMessage(event) {
    event.preventDefault();
    const itemId = document.getElementById('msgItemId').value;
    const receiverId = document.getElementById('msgReceiverId').value;
    const messageText = document.getElementById('msgTextarea').value;

    if (!messageText.trim()) return;

    console.log("Sending Message:", {
        itemId, receiverId, sender_id: currentUser.id, message: messageText.trim()
    });

    try {
        const { data, error } = await _supabase.from('messages').insert({
            item_id: itemId,
            sender_id: currentUser.id,
            receiver_id: receiverId,
            message: messageText.trim()
        });

        if (error) {
            console.error("Supabase Send Error Details:", error);
            throw error;
        }
        console.log("Message sent successfully:", data);

        closeModal('messageModal');
        showToast("Message sent! The owner will be notified.");
    } catch (e) {
        console.error("Send Error:", e);
        showToast("Failed to send message. Try again later.");
    }
}

async function updateUnreadBadge() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/messages/unread_count?user_id=${currentUser.id}`);
        const data = await res.json();
        const count = data.count || 0;
        
        const badge = document.getElementById('msgBadge');
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {
        console.warn("Badge Update Error:", e);
    }
}

function setupRealtimeMessages() {
    if (!currentUser) return;
    // Realtime disabled for stability; using periodic refresh instead
    setInterval(updateUnreadBadge, 30000);
}

async function openInbox() {
    if (!currentUser) return;
    openModal('inboxModal');
    showThreadList();
}

async function showThreadList() {
    const threadList = document.getElementById('threadList');
    const convView = document.getElementById('conversationView');
    threadList.style.display = 'flex';
    convView.style.display = 'none';
    threadList.innerHTML = '<p style="text-align:center; padding:20px;">Loading conversations...</p>';

    try {
        console.log("Fetching Inbox for:", currentUser.id);
        // Fetch items and messages
        const [itemsRes, msgsRes] = await Promise.all([
            fetch(`${API_URL}/items`).then(r => r.json()),
            _supabase.from('messages')
                .select('*')
                .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                .order('created_at', { ascending: false })
        ]);

        if (msgsRes.error) {
            console.error("Supabase Inbox Error:", msgsRes.error);
            throw msgsRes.error;
        }
        console.log("Fetched Messages:", msgsRes.data);
        const messages = msgsRes.data;

        // Group by item_id
        const threads = {};
        messages.forEach(m => {
            if (!threads[m.item_id]) {
                const item = itemsRes.find(it => it.id == m.item_id) || { item_name: "Unknown Item" };
                threads[m.item_id] = {
                    item_id: m.item_id,
                    item_name: item.item_name,
                    last_msg: m,
                    unread: m.receiver_id === currentUser.id && !m.is_read
                };
            } else if (m.receiver_id === currentUser.id && !m.is_read) {
                threads[m.item_id].unread = true;
            }
        });

        const threadArray = Object.values(threads);
        if (threadArray.length === 0) {
            threadList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>No messages yet. Contact owners of lost or found items to start a secure chat!</p>
                </div>`;
            return;
        }

        threadList.innerHTML = '';
        threadArray.forEach(t => {
            const time = timeSince(t.last_msg.created_at);
            const card = document.createElement('div');
            card.className = `thread-item ${t.unread ? 'unread' : ''}`;
            card.onclick = () => openThread(t.item_id);
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong style="color:var(--secondary-color);">Re: ${t.item_name}</strong>
                    <small style="color:#888;">${time}</small>
                </div>
                <div style="font-size:0.85rem; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${t.last_msg.message}
                </div>
            `;
            threadList.appendChild(card);
        });

    } catch (e) {
        console.error("Inbox Error:", e);
        threadList.innerHTML = '<p style="color:red; text-align:center; padding:20px;">Error loading messages.</p>';
    }
}

async function openThread(itemId) {
    const threadList = document.getElementById('threadList');
    const convView = document.getElementById('conversationView');
    const chatArea = document.getElementById('chatMessages');
    
    threadList.style.display = 'none';
    convView.style.display = 'block';
    chatArea.innerHTML = '<p style="text-align:center; padding:20px;">Fetching conversation...</p>';

    try {
        const res = await fetch(`${API_URL}/messages?item_id=${itemId}&user_id=${currentUser.id}`);
        let messages = await res.json();
        
        // Supabase query returns them unsorted in our simple proxy or we sort here
        messages.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

        // Set up context for reply
        const firstMsg = messages.find(m => m.sender_id !== currentUser.id) || messages[0];
        const otherPartyId = firstMsg.sender_id === currentUser.id ? firstMsg.receiver_id : firstMsg.sender_id;
        
        document.getElementById('replyItemId').value = itemId;
        document.getElementById('replyReceiverId').value = otherPartyId;

        chatArea.innerHTML = '';
        messages.forEach(m => {
            const isSent = m.sender_id === currentUser.id;
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isSent ? 'sent' : 'received'}`;
            bubble.innerHTML = `
                ${m.message}
                <span class="chat-time">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            `;
            chatArea.appendChild(bubble);
        });

        chatArea.scrollTop = chatArea.scrollHeight;

        // Mark as read via backend
        fetch(`${API_URL}/messages/mark_read?item_id=${itemId}&user_id=${currentUser.id}`, { method: 'PUT' });
        
        updateUnreadBadge();

    } catch (e) {
        console.error("Thread Error:", e);
        chatArea.innerHTML = '<p style="color:red; text-align:center;">Failed to load chat.</p>';
    }
}

async function handleReply(event) {
    event.preventDefault();
    const itemId = document.getElementById('replyItemId').value;
    const receiverId = document.getElementById('replyReceiverId').value;
    const input = document.getElementById('replyInput');
    const text = input.value.trim();

    if (!text) return;

    try {
        const res = await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_id: itemId,
                sender_id: currentUser.id,
                receiver_id: receiverId,
                message: text
            })
        });

        if (!res.ok) throw new Error('Reply failed');
        input.value = '';
        openThread(itemId); // Refresh
    } catch (e) {
        console.error("Reply Error:", e);
        showToast("Failed to send reply.");
    }
}
