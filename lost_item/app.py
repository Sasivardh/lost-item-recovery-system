from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import datetime
import requests
import json
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


SUPABASE_URL = "https://xomclzzklfhuilubvtbz.supabase.co/rest/v1"
SUPABASE_KEY = "sb_secret_nsaHSANyXZ9vlvFtSsFyqQ_o9oZCx7I"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

@app.route('/api/items', methods=['GET'])
def get_items():
    try:
        response = requests.get(f"{SUPABASE_URL}/items?select=*&order=timestamp.desc", headers=headers)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        return jsonify([])

@app.route('/api/items', methods=['POST'])
def add_item():
    data = request.json
    status = data.get('status', 'open')
    resolved_time = None
    if status == 'resolved':
        resolved_time = datetime.datetime.now().isoformat()

    # Official Campus Security Vault Integration
    location = data.get('location')
    handed_over_to = data.get('handed_over_to', '')
    if handed_over_to == 'Security Office':
        location = 'Campus Security Vault'
        
    item_type = data.get('type')
    item_name = data.get('item_name')
    category = data.get('category')
    reporter_email = data.get('reporter_email', '')
    date_reported = data.get('date_reported')
    description = data.get('description', '')

    if not item_type or not item_name or not category or not reporter_email:
        return jsonify({"error": "Missing required fields"}), 400
        
    insert_data = {
        "type": item_type,
        "item_name": item_name,
        "category": category,
        "date_reported": date_reported,
        "location": location,
        "description": description,
        "handed_over_to": handed_over_to,
        "reporter_email": reporter_email,
        "user_id": data.get('user_id'),
        "status": status,
        "resolved_timestamp": resolved_time
    }
    
    try:
        response = requests.post(f"{SUPABASE_URL}/items", json=insert_data, headers=headers)
        response.raise_for_status()
        res_data = response.json()
        new_id = res_data[0]['id'] if (res_data and isinstance(res_data, list) and len(res_data) > 0) else 0
        return jsonify({"success": True, "id": new_id, "message": f"{item_type.capitalize()} item reported successfully!"}), 201
    except requests.exceptions.HTTPError as e:
        err_msg = e.response.text if e.response else str(e)
        status_code = e.response.status_code if e.response else 500
        return jsonify({"error": err_msg}), status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/items/<int:item_id>/resolve', methods=['PUT'])
def resolve_item(item_id):
    current_time = datetime.datetime.now().isoformat()
    try:
        update_data = {'status': 'resolved', 'resolved_timestamp': current_time}
        response = requests.patch(f"{SUPABASE_URL}/items?id=eq.{item_id}", json=update_data, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if len(data) > 0:
            receipt_id = f"REC-{datetime.datetime.now().strftime('%Y%m%d')}-{item_id}"
            return jsonify({
                "success": True,
                "receipt": {
                    "receipt_id": receipt_id,
                    "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "status": "closed",
                    "message": "Item successfully marked as resolved and safely handed over."
                }
            }), 200
        return jsonify({"error": "Item not found"}), 404
    except requests.exceptions.HTTPError as e:
        err_msg = e.response.text if e.response else str(e)
        status_code = e.response.status_code if e.response else 500
        return jsonify({"error": err_msg}), status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/messages', methods=['GET'])
def get_messages_list():
    item_id = request.args.get('item_id')
    user_id = request.args.get('user_id')
    try:
        url = f"{SUPABASE_URL}/messages?select=*&order=created_at.desc"
        if item_id:
            url += f"&item_id=eq.{item_id}"
        if user_id:
            url += f"&or=(sender_id.eq.{user_id},receiver_id.eq.{user_id})"
            
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return jsonify(response.json())
        return jsonify([]), 200
    except Exception as e:
        return jsonify([]), 500

@app.route('/api/messages', methods=['POST'])
def send_message():
    data = request.json
    item_id = data.get('item_id')
    message = data.get('message')
    sender_id = data.get('sender_id')
    receiver_id = data.get('receiver_id')
    
    if not item_id or not message or not sender_id:
        return jsonify({"error": "Missing required fields"}), 400

    # Handle missing receiver_id (for older items)
    if not receiver_id or receiver_id == 'undefined':
        try:
            # Look up item to get reporter_email
            item_res = requests.get(f"{SUPABASE_URL}/items?id=eq.{item_id}", headers=headers)
            if item_res.status_code == 200 and len(item_res.json()) > 0:
                item = item_res.json()[0]
                email = item.get('reporter_email')
                if email:
                    # Look up user ID from our local users.json
                    users = load_local_users()
                    user = users.get(email)
                    if user and user.get('id'):
                        receiver_id = user.get('id')
                    else:
                        # Fallback to email as ID if not in directory (might still fail UUID check)
                        receiver_id = f"email:{email}"
        except:
            pass

    if not receiver_id or receiver_id == 'undefined':
        return jsonify({"error": "Recipient identity not found. The reporter may not have a registered profile."}), 404
        
    insert_data = {
        'item_id': item_id,
        'sender_id': sender_id,
        'receiver_id': receiver_id,
        'message': message,
        'is_read': False
    }
    
    try:
        response = requests.post(f"{SUPABASE_URL}/messages", json=insert_data, headers=headers)
        response.raise_for_status()
        return jsonify({"success": True, "message": "Message sent!"}), 201
    except requests.exceptions.HTTPError as e:
        # Check if it was a UUID format error
        err_body = e.response.text
        if "invalid input syntax for type uuid" in err_body:
             return jsonify({"error": "Recipient profile is legacy and cannot receive messages yet."}), 400
        return jsonify({"error": err_body}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/messages/unread_count', methods=['GET'])
def get_unread_count():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"count": 0})
    try:
        url = f"{SUPABASE_URL}/messages?select=id&receiver_id=eq.{user_id}&is_read=eq.false"
        combined_headers = headers.copy()
        combined_headers["Prefer"] = "count=exact"
        response = requests.get(url, headers=combined_headers)
        # Supabase returns count in header when Prefer: count=exact is sent
        count = response.headers.get('Content-Range', '0-0/0').split('/')[-1]
        return jsonify({"count": int(count)})
    except:
        return jsonify({"count": 0})

@app.route('/api/messages/mark_read', methods=['PUT'])
def mark_messages_read():
    item_id = request.args.get('item_id')
    user_id = request.args.get('user_id')
    if not item_id or not user_id:
        return jsonify({"success": False}), 400
    try:
        update_data = {'is_read': True}
        url = f"{SUPABASE_URL}/messages?item_id=eq.{item_id}&receiver_id=eq.{user_id}&is_read=eq.false"
        requests.patch(url, json=update_data, headers=headers)
        return jsonify({"success": True})
    except:
        return jsonify({"success": False}), 500
 
@app.route('/api/stats', methods=['GET'])
def get_stats():
    # Helper to calculate average recovery time
    try:
        response = requests.get(f"{SUPABASE_URL}/items?select=*", headers=headers)
        items = response.json()
    except Exception as e:
        print(f"Stats Error: {e}")
        return jsonify({"error": "Failed to fetch items"}), 500

    lost_count = len([i for i in items if i.get('type') == 'lost'])
    found_count = len([i for i in items if i.get('type') == 'found'])
    recovered_count = len([i for i in items if i.get('status') == 'resolved'])
    
    # Calculate Avg Recovery Time based on timestamp vs resolved_timestamp
    total_hours = 0.0
    resolved_items_with_times = [i for i in items if i.get('status') == 'resolved' and i.get('resolved_timestamp') and i.get('timestamp')]
    
    for item in resolved_items_with_times:
        try:
            start = datetime.datetime.fromisoformat(item['timestamp'].replace('Z', '+00:00'))
            end = datetime.datetime.fromisoformat(item['resolved_timestamp'].replace('Z', '+00:00'))
            diff = float((end - start).total_seconds() / 3600.0)
            total_hours = float(total_hours) + diff
        except:
            pass
            
    avg_recovery_time = 0
    if len(resolved_items_with_times) > 0:
        avg = float(total_hours) / len(resolved_items_with_times)
        avg_recovery_time = int(avg)

    # Categories logic
    category_counts = {}
    for item in items:
        if item.get('type') == 'lost':
            cat = item.get('category')
            category_counts[cat] = category_counts.get(cat, 0) + 1
            
    sorted_cats = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    top_categories = [{"category": c[0], "count": c[1]} for c in sorted_cats[:3]]
    
    return jsonify({
        "lost": lost_count,
        "found": found_count,
        "recovered": recovered_count,
        "avg_recovery_time_hours": avg_recovery_time,
        "top_lost_categories": top_categories
    })

USERS_FILE = 'users.json'

def load_local_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except:
        return {}

def save_local_users(users):
    try:
        with open(USERS_FILE, 'w') as f:
            json.dump(users, f, indent=2)
            return True
    except:
        return False

@app.route('/api/users', methods=['GET'])
def get_users_list():
    users = load_local_users()
    # Convert dict to list for frontend
    return jsonify(list(users.values()))

@app.route('/api/users', methods=['POST'])
def upsert_user():
    data = request.json
    email = data.get('email')
    if not email:
        return jsonify({"error": "Email required"}), 400
    
    users = load_local_users()
    users[email] = data
    if save_local_users(users):
        return jsonify({"success": True}), 200
    return jsonify({"error": "Failed to save user"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
