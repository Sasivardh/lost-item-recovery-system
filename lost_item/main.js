/**
 * CAMPUS LOST & FOUND - VERCEL SERVERLESS VERSION
 * Integrated with Supabase for real-time data and authentication.
 */

// 1. SUPABASE CONFIGURATION (HARDCODED FOR VERCEL)
const SUPABASE_URL = "https://xomclzzklfhuilubvtbz.supabase.co";
const SUPABASE_ANON_KEY = "sb_secret_nsaHSANyXZ9vlvFtSsFyqQ_o9oZCx7I";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
});

// 2. ENVIRONMENT LOG
console.log('CampusFind loaded — ENV:', 
    window.location.hostname === 'localhost' ? 'LOCAL' : 'PRODUCTION'
);

// 3. STATE & GLOBALS
let currentItems = [];
let currentFilter = 'all';
let currentUser = JSON.parse(localStorage.getItem('diet_user')) || null;
let bannerBase64 = null;
let currentReceiptId = null;
let currentReceiptTimestamp = null;

// Fix asset path for Vercel
const BANNER_PATH = '/banner.png';

// 4. INITIALIZATION
async function initApp() {
    checkAuth();
    await loadBanner();
    fetchItems();
    fetchStats();
}

// 5. AUTHENTICATION & SECURITY
function checkAuth() {
    if (!currentUser && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }
    
    if (currentUser) {
        const adminLink = document.getElementById('adminNavLink');
        if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        
        // Setup Live Features
        updateUnreadBadge();
        setupRealtimeMessages();
    }
}

function logout() {
    localStorage.removeItem('diet_user');
    window.location.href = 'login.html';
}

// 6. DASHBOARD & DATA FETCHING
async function fetchItems() {
    try {
        const { data, error } = await _supabase
            .from('items')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) throw error;
        currentItems = data || [];
        renderItems(currentFilter);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

function renderItems(filter) {
    const container = document.getElementById('itemsContainer');
    if (!container) return;
    container.innerHTML = '';
    
    let filtered = currentItems;
    if (filter === 'my_reports') {
        if (!currentUser) return;
        filtered = currentItems.filter(i => i.reporter_email === currentUser.email);
    } else if (filter !== 'all') {
        filtered = currentItems.filter(i => i.type === filter);
    }
    
    if(filtered.length === 0){
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: black;">No items found.</div>`;
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
                    `<button class="btn btn-primary" style="width:100%; justify-content:center;" onclick='openMessageModal(${item.id})'><i class="fas fa-paper-plane"></i> Contact Owner</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function filterItems(type, element) {
    currentFilter = type;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    if (element) element.classList.add('active');
    renderItems(currentFilter);
}

// 7. ITEM DETAILS & RESOLUTION
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
        html += `<strong style="color: #111;"><i class="fas fa-align-left" style="width: 25px;"></i> Description & Marks:</strong><p style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 8px;">${item.description || 'No specific description provided.'}</p>`;
    } else {
        html += `<strong style="color: #111;"><i class="fas fa-hand-holding" style="width: 25px;"></i> Handed Over To:</strong><p style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 8px;">${item.handed_over_to || 'Not specified'}</p>`;
    }

    if (currentUser && currentUser.email !== item.reporter_email && item.status !== 'resolved') {
        html += `<div style="margin-top: 20px; text-align: center;"><button class="btn btn-secondary slide-hover" onclick="openMessageModal(${item.id})"><i class="fas fa-shield-alt"></i> Securely Contact Reporter</button></div>`;
    } else if (currentUser && currentUser.email === item.reporter_email) {
        html += `<div style="margin-top: 20px; text-align: center; color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> This is your post.</div>`;
        if (item.status !== 'resolved') {
            html += `<div style="margin-top: 15px; text-align: center;"><button class="btn btn-primary" onclick="resolveItem(${item.id})"><i class="fas fa-flag-checkered"></i> Mark as Resolved (Claimed/Returned)</button></div>`;
        }
    }
    
    if (item.status === 'resolved') {
        html += `<div style="margin-top: 15px; text-align: center;"><button class="btn btn-outline" onclick="viewReceipt(${item.id}, '${item.resolved_timestamp}')"><i class="fas fa-file-invoice"></i> View Official Digital Receipt</button></div>`;
    }
    
    content.innerHTML = html;
    openModal('detailsModal');
}

async function resolveItem(itemId) {
    if(!confirm("Are you sure? A digital receipt will be generated.")) return;
    
    try {
        const resolvedTimestamp = new Date().toISOString();
        const { error } = await _supabase
            .from('items')
            .update({ 
                status: 'resolved', 
                resolved_timestamp: resolvedTimestamp 
            })
            .eq('id', itemId);

        if (error) throw error;
        
        showToast("Success! The item is now marked as resolved.", true);
        closeModal('detailsModal');
        fetchItems();
        viewReceipt(itemId, resolvedTimestamp);
    } catch (e) {
        showToast("Failed to resolve item.");
    }
}

function viewReceipt(itemId, timestampStr) {
    closeModal('detailsModal');
    const ts = timestampStr || new Date().toISOString();
    currentReceiptId = `REC-${ts.split('-').join('').slice(0,8)}-${itemId}`;
    currentReceiptTimestamp = ts;
    
    document.getElementById('receiptData').innerHTML = `
        <b>Receipt ID:</b> ${currentReceiptId}<br><br>
        <b>Timestamp:</b> ${new Date(ts).toLocaleString()}<br><br>
        <b>Action:</b> Official Handover Resolved<br><br>
        <b>Status:</b> CLOSED & CLEAR
    `;
    openModal('receiptModal');
}

// 8. REPORTING (SUBMISSION)
async function submitForm(event, modalId) {
    event.preventDefault();
    const form = event.target;
    const type = modalId === 'lostModal' ? 'lost' : 'found';
    
    const itemData = {
        type: type,
        item_name: form.querySelector('.item-name').value,
        category: form.querySelector('.item-category').value,
        date_reported: form.querySelector('.item-date').value,
        location: form.querySelector('.item-location').value,
        description: type === 'lost' ? form.querySelector('.item-desc').value : '',
        handed_over_to: type === 'found' ? form.querySelector('.item-handover').value : '',
        status: form.querySelector('.item-status').value,
        reporter_email: currentUser.email,
        user_id: currentUser.id
    };

    try {
        const { error } = await _supabase.from('items').insert(itemData);
        if (error) throw error;
        
        showToast("Report submitted successfully!", true);
        closeModal(modalId);
        form.reset();
        fetchItems();
        fetchStats();
    } catch (e) {
        showToast("Error submitting report.");
    }
}

async function submitIdFound(event) {
    event.preventDefault();
    const rollQuery = document.getElementById('idRollNumber').value.trim().toUpperCase();
    const dropLocation = document.getElementById('idDropLocation').value.trim();
    
    const itemData = {
        type: 'found',
        item_name: `Student ID Card (${rollQuery})`,
        category: 'ID Cards',
        date_reported: new Date().toISOString().split('T')[0],
        location: dropLocation,
        description: `URGENT ID RECOVERY: Found student ID card for Roll Number ${rollQuery}.`,
        handed_over_to: dropLocation,
        reporter_email: currentUser.email,
        user_id: currentUser.id,
        status: 'open'
    };
    
    try {
        const { error } = await _supabase.from('items').insert(itemData);
        if (error) throw error;
        closeModal('idCardModal');
        showToast("ID logging successful!", true);
        fetchItems();
    } catch(e) {
        showToast("Error logging ID card.");
    }
}

// 9. MESSAGING SYSTEM (THREADED)
async function updateUnreadBadge() {
    if (!currentUser) return;
    try {
        const { count, error } = await _supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;
        const b = document.getElementById('msgBadge');
        if (b) {
            b.textContent = count;
            b.style.display = count > 0 ? 'block' : 'none';
        }
    } catch (e) {}
}

function openMessageModal(itemId) {
    const item = currentItems.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('msgItemId').value = item.id;
    document.getElementById('msgReceiverId').value = item.user_id;
    document.getElementById('msgModalItemName').textContent = `Contacting Owner of: ${item.item_name}`;
    document.getElementById('msgTextarea').value = '';
    
    closeModal('detailsModal');
    openModal('messageModal');
}

async function handleSendMessage(event) {
    event.preventDefault();
    const itemId = document.getElementById('msgItemId').value;
    const receiverId = document.getElementById('msgReceiverId').value;
    const msg = document.getElementById('msgTextarea').value.trim();
    
    if (!msg) return;

    try {
        const { error } = await _supabase.from('messages').insert({
            item_id: itemId,
            sender_id: currentUser.id,
            receiver_id: receiverId,
            message: msg
        });
        if (error) throw error;
        closeModal('messageModal');
        showToast("Message sent securely!", true);
    } catch (e) {
        showToast("Failed to send message.");
    }
}

async function openInbox() {
    openModal('inboxModal');
    showThreadList();
}

async function showThreadList() {
    const list = document.getElementById('threadList');
    const view = document.getElementById('conversationView');
    list.style.display = 'flex';
    view.style.display = 'none';
    list.innerHTML = '<p style="text-align:center; padding:20px;">Fetching chats...</p>';

    try {
        const { data: messages, error } = await _supabase
            .from('messages')
            .select('*')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const threads = {};
        messages.forEach(m => {
            if (!threads[m.item_id]) {
                const item = currentItems.find(it => it.id == m.item_id) || { item_name: "Unknown Item" };
                threads[m.item_id] = {
                    item_id: m.item_id,
                    item_name: item.item_name,
                    last_msg: m,
                    unread: m.receiver_id === currentUser.id && !m.is_read
                };
            }
        });

        const threadArr = Object.values(threads);
        if (threadArr.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:40px; color:#999;">No messages yet.</p>';
            return;
        }

        list.innerHTML = '';
        threadArr.forEach(t => {
            const div = document.createElement('div');
            div.className = `thread-item ${t.unread ? 'unread' : ''}`;
            div.onclick = () => openThread(t.item_id);
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${t.item_name}</strong>
                    <small>${timeSince(t.last_msg.created_at)}</small>
                </div>
                <div style="font-size:0.85rem; color:#666; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${t.last_msg.message}
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<p style="color:red; text-align:center;">Inbox Error.</p>';
    }
}

async function openThread(itemId) {
    const list = document.getElementById('threadList');
    const view = document.getElementById('conversationView');
    const chat = document.getElementById('chatMessages');
    
    list.style.display = 'none';
    view.style.display = 'block';
    chat.innerHTML = '<p style="text-align:center; padding:20px;">Loading thread...</p>';

    try {
        const { data: messages, error } = await _supabase
            .from('messages')
            .select('*')
            .eq('item_id', itemId)
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Determine receiver for reply
        const other = messages.find(m => m.sender_id !== currentUser.id);
        const pid = other ? (other.sender_id === currentUser.id ? other.receiver_id : other.sender_id) : null;
        
        document.getElementById('replyItemId').value = itemId;
        document.getElementById('replyReceiverId').value = pid || (messages[0].sender_id === currentUser.id ? messages[0].receiver_id : messages[0].sender_id);

        chat.innerHTML = '';
        messages.forEach(m => {
            const sent = m.sender_id === currentUser.id;
            const b = document.createElement('div');
            b.className = `chat-bubble ${sent ? 'sent' : 'received'}`;
            b.innerHTML = `${m.message} <span class="chat-time">${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
            chat.appendChild(b);
        });
        chat.scrollTop = chat.scrollHeight;

        // Mark as read
        await _supabase.from('messages').update({ is_read: true }).eq('item_id', itemId).eq('receiver_id', currentUser.id);
        updateUnreadBadge();
    } catch (e) {
        chat.innerHTML = '<p style="color:red;">Error loading chat.</p>';
    }
}

async function handleReply(event) {
    event.preventDefault();
    const itemId = document.getElementById('replyItemId').value;
    const receiverId = document.getElementById('replyReceiverId').value;
    const input = document.getElementById('replyInput');
    const txt = input.value.trim();
    if (!txt) return;

    try {
        const { error } = await _supabase.from('messages').insert({
            item_id: itemId,
            sender_id: currentUser.id,
            receiver_id: receiverId,
            message: txt
        });
        if (error) throw error;
        input.value = '';
        openThread(itemId);
    } catch (e) {}
}

function setupRealtimeMessages() {
    _supabase.channel('messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (payload.new.receiver_id === currentUser.id) {
            showToast("💬 New message received!", 5000);
            updateUnreadBadge();
            if (document.getElementById('inboxModal').style.display === 'block') {
                if (document.getElementById('conversationView').style.display === 'block' && payload.new.item_id == document.getElementById('replyItemId').value) {
                    openThread(payload.new.item_id);
                } else {
                    showThreadList();
                }
            }
        }
    }).subscribe();
}

// 10. ADMIN DASHBOARD
async function fetchStats() {
    const { data: items } = await _supabase.from('items').select('*');
    if (!items) return;
    
    const stats = {
        lost: items.filter(i => i.type === 'lost').length,
        found: items.filter(i => i.type === 'found').length,
        recovered: items.filter(i => i.status === 'resolved').length
    };
    
    if (document.getElementById('lostCount')) document.getElementById('lostCount').innerText = stats.lost;
    if (document.getElementById('foundCount')) document.getElementById('foundCount').innerText = stats.found;
    if (document.getElementById('recoveredCount')) document.getElementById('recoveredCount').innerText = stats.recovered;
}

async function renderAdminUsers() {
    const tb = document.getElementById('registeredUsersTable');
    if(!tb) return;
    tb.innerHTML = '<tr><td colspan="6" style="text-align: center;">Syncing with directory...</td></tr>';
    
    try {
        const { data: users } = await _supabase.from('profiles').select('*');
        tb.innerHTML = '';
        users.forEach(u => {
            tb.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <td style="padding: 10px;">${u.name || 'Anonymous'}</td>
                    <td style="padding: 10px;">${u.roll || '-'}</td>
                    <td style="padding: 10px;">${u.email}</td>
                    <td style="padding: 10px;">${u.branch || '-'}</td>
                    <td style="padding: 10px;">${u.year || '-'}</td>
                    <td style="padding: 10px;">${u.gender || '-'}</td>
                </tr>
            `;
        });
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Directory offline.</td></tr>';
    }
}

async function renderAdminMessages() {
    const feed = document.getElementById('adminMessagesFeed');
    if(!feed) return;
    feed.innerHTML = '<p style="text-align: center;">Fetching logs...</p>';
    
    try {
        const { data: msgs } = await _supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20);
        feed.innerHTML = '';
        msgs.forEach(m => {
            feed.innerHTML += `
                <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid var(--primary-color);">
                    <p style="font-size: 0.85rem; color:#666;">${new Date(m.created_at).toLocaleString()}</p>
                    <p>${m.message}</p>
                </div>
            `;
        });
    } catch (e) {}
}

async function searchReceipt() {
    const q = document.getElementById('adminReceiptSearch').value.trim();
    const res = document.getElementById('adminReceiptResult');
    if (!q) return;

    try {
        const id = q.split('-').pop();
        const { data: item } = await _supabase.from('items').select('*').eq('id', id).single();
        res.style.display = 'block';
        if (!item || item.status !== 'resolved') {
            res.innerHTML = '<p style="color:red;">Record not found.</p>';
            return;
        }
        res.innerHTML = `
            <div style="background: rgba(255,255,255,0.8); padding: 15px; border-radius: 8px;">
                <p><strong>Item:</strong> ${item.item_name}</p>
                <p><strong>Resolved:</strong> ${new Date(item.resolved_timestamp).toLocaleString()}</p>
                <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="downloadReceipt()">Regenerate Receipt</button>
            </div>
        `;
        currentReceiptId = q;
        currentReceiptTimestamp = item.resolved_timestamp;
    } catch (e) {
        res.innerHTML = '<p style="color:red;">Search failed.</p>';
    }
}

// 11. PROFILE MANAGEMENT (RECURRING TABBED)
function openProfile() {
    if(!currentUser) return;
    document.getElementById('dispName').innerText = currentUser.name;
    document.getElementById('dispEmail').innerText = currentUser.email;
    document.getElementById('dispRoll').innerText = currentUser.roll || '-';
    document.getElementById('dispBranch').innerText = currentUser.branch || '-';
    document.getElementById('dispYear').innerText = currentUser.year || '-';
    
    // Switch to display tab by default
    switchProfileTab('display');
    openModal('profileModal');
}

function switchProfileTab(tab) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.profile-view').forEach(v => v.classList.remove('active'));
    
    const t = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if(t) t.classList.add('active');
    
    const v = document.getElementById(tab + 'View');
    if(v) v.classList.add('active');
    
    if (tab === 'edit') {
        document.getElementById('editName').value = currentUser.name || '';
        document.getElementById('editRoll').value = currentUser.roll || '';
        document.getElementById('editBranch').value = currentUser.branch || '';
        document.getElementById('editYear').value = currentUser.year || '';
        document.getElementById('editMobile').value = currentUser.mobile || '';
    }
}

async function saveProfile() {
    const updated = {
        ...currentUser,
        name: document.getElementById('editName').value.trim(),
        roll: document.getElementById('editRoll').value.trim(),
        branch: document.getElementById('editBranch').value,
        year: document.getElementById('editYear').value,
        mobile: document.getElementById('editMobile').value.trim()
    };

    try {
        const { error } = await _supabase.from('profiles').upsert(updated).eq('id', currentUser.id);
        if (error) throw error;
        currentUser = updated;
        localStorage.setItem('diet_user', JSON.stringify(currentUser));
        showToast("Profile secured!", true);
        openProfile();
    } catch (e) {
        showToast("Profile update failed.");
    }
}

// 12. UTILS
function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function openModal(id) {
    const m = document.getElementById(id);
    if(m) m.classList.add('show');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if(m) m.classList.remove('show');
}

function timeSince(date) {
    if(!date) return "long ago";
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let i = seconds / 31536000;
    if (i > 1) return Math.floor(i) + "y";
    i = seconds / 2592000;
    if (i > 1) return Math.floor(i) + "mo";
    i = seconds / 86400;
    if (i > 1) return Math.floor(i) + "d";
    i = seconds / 3600;
    if (i > 1) return Math.floor(i) + "h";
    i = seconds / 60;
    if (i > 1) return Math.floor(i) + "m";
    return Math.floor(seconds) + "s";
}

async function loadBanner() {
    try {
        const r = await fetch(BANNER_PATH);
        const b = await r.blob();
        return new Promise(res => {
            const rd = new FileReader();
            rd.onloadend = () => { bannerBase64 = rd.result; res(rd.result); };
            rd.readAsDataURL(b);
        });
    } catch(e) { return null; }
}

async function downloadReceipt() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    if (bannerBase64) doc.addImage(bannerBase64, 'PNG', 10, 10, 190, 30);
    doc.setFontSize(18);
    doc.text("Official Recovery Receipt", 105, 50, {align: 'center'});
    doc.setFontSize(12);
    doc.text(`Receipt ID: ${currentReceiptId}`, 20, 70);
    doc.text(`Timestamp: ${new Date(currentReceiptTimestamp).toLocaleString()}`, 20, 80);
    doc.text("Action: Security Verified Handover", 20, 90);
    doc.save(`${currentReceiptId}.pdf`);
}

// 13. GLOBAL EXPORTS FOR VERCEL
window.filterItems = filterItems;
window.viewDetails = viewDetails;
window.resolveItem = resolveItem;
window.viewReceipt = viewReceipt;
window.submitForm = submitForm;
window.submitIdFound = submitIdFound;
window.openInbox = openInbox;
window.openThread = openThread;
window.handleReply = handleReply;
window.openMessageModal = openMessageModal;
window.handleSendMessage = handleSendMessage;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleAdmin = toggleAdmin;
window.logout = logout;
window.openProfile = openProfile;
window.switchProfileTab = switchProfileTab;
window.saveProfile = saveProfile;
window.downloadReceipt = downloadReceipt;
window.searchReceipt = searchReceipt;
window.showThreadList = showThreadList;

// Run Init
initApp();
