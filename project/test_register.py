import json
import urllib.request

url='http://127.0.0.1:8001/api/register/'
payload={'username':'testuser_frontend','email':'frontendtest@example.com','password':'pass12345'}
data=json.dumps(payload).encode()
req=urllib.request.Request(url,data,headers={'Content-Type':'application/json'})
print('Sending payload:',payload)
try:
    res=urllib.request.urlopen(req)
    body=res.read().decode()
    print('Status',res.getcode())
    print('Body',body)
except Exception as e:
    print('Error',e)
    try:
        print(e.read().decode())
    except:
        pass

# Now check sqlite db for the user
import sqlite3
import os
DB='db.sqlite3'
if os.path.exists(DB):
    conn=sqlite3.connect(DB)
    cur=conn.cursor()
    cur.execute("SELECT username, email FROM auth_user WHERE username=?", ('testuser_frontend',))
    row=cur.fetchone()
    print('DB row:',row)
    conn.close()
else:
    print('DB not found')
