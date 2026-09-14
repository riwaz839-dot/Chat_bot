import { useEffect, useMemo, useRef, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from './api/axios.js';

const storageKey = 'nepchat-auth';
const outgoingRequestsStorageKey = 'nepchat-outgoing-requests';
const defaultForm = { username: '', email: '', password: '' };

function App() {
  const [activeView, setActiveView] = useState('login');
  const [auth, setAuth] = useState({ access: null, refresh: null, username: null, email: null });
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newFriendId, setNewFriendId] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesAbortControllerRef = useRef(null);
  const [processingRequests, setProcessingRequests] = useState([]);
  const [usernames, setUsernames] = useState({});

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.access && isValidToken(parsed.access)) {
        setAuth(parsed);
        setCurrentUserId(Number(getCurrentUserId(parsed.access)));
        setActiveView('dashboard');
      } else {
        clearSession();
      }
    }
    const loaded = loadOutgoingRequests();
    setOutgoingRequests(loaded);
    extractUsernamesFromRequests(loaded);
  }, []);

  useEffect(() => {
    if (auth.access) {
      fetchFriendRequests();
      fetchFriendships();
    }
  }, [auth.access, currentUserId]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    const timeout = setTimeout(() => {
      fetchSearchResults();
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchQuery, auth.access]);

  useEffect(() => {
    if (!auth.access || !selectedConversation) return undefined;

    let timer = null;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await fetchMessagesForConversation(selectedConversation);
      if (!cancelled) {
        timer = setTimeout(poll, 2500);
      }
    };

    timer = setTimeout(poll, 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [auth.access, selectedConversation]);

  const parseJwt = (token) => {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const json = decodeURIComponent(decoded.split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch {
      return {};
    }
  };

  const getApiError = (err, fallback = 'An unexpected error occurred.') => {
    console.error('[NepChat API error]', err);
    return err?.response?.data?.detail || err?.response?.data?.error || err?.message || fallback;
  };


  const getCurrentUserId = (token) => {
    if (!token) return null;
    const payload = parseJwt(token);
    return payload.user_id || payload.sub || null;
  };

  const isValidToken = (token) => {
    if (!token) return false;
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return false;
    return payload.exp * 1000 > Date.now();
  };

  const saveAuth = (values) => {
    localStorage.setItem(storageKey, JSON.stringify(values));
    setAuth(values);
  };

  const saveOutgoingRequests = (requests) => {
    localStorage.setItem(outgoingRequestsStorageKey, JSON.stringify(requests));
  };

  const loadOutgoingRequests = () => {
    const saved = localStorage.getItem(outgoingRequestsStorageKey);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      // normalize stored outgoing requests to ensure numeric ids and consistent shape
      if (Array.isArray(parsed)) return parsed.map((r) => normalizeOutgoingRequest(r)).filter((r) => r.status !== 'accepted');
      return [];
    } catch {
      return [];
    }
  };

  const filteredSearchResults = useMemo(
    () => searchResults.filter((result) => Number(result.id) !== Number(currentUserId)),
    [searchResults, currentUserId]
  );

  const clearSession = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(outgoingRequestsStorageKey);
    setAuth({ access: null, refresh: null, username: null, email: null });
    setFriends([]);
    setFriendRequests([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedConversation(null);
    setMessages([]);
    setNewMessage('');
    setNewFriendId('');
    setCurrentUserId(null);
    setMessage('');
    setError('');
  };

  const handleInput = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
    setError('');
    setMessage('');
  };

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${auth.access}` } });

  const updateAuthFromToken = (access, refresh, username, email) => {
    const tokenUserId = getCurrentUserId(access);
    setCurrentUserId(Number(tokenUserId));
    const payload = {
      access,
      refresh,
      username: username || form.username || '',
      email: email || form.email || '',
    };
    saveAuth(payload);
    if (tokenUserId) {
      setUsernames((prev) => ({ ...prev, [Number(tokenUserId)]: payload.username }));
    }
    return payload;
  };

  const handleAuthResponse = (data, email = null) => {
    updateAuthFromToken(data.access, data.refresh, form.username || data.username || '', email || form.email || '');
    setMessage(data.message || 'Authentication successful.');
    setError('');
    setActiveView('dashboard');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await api.post('/token/', {
        username: form.username,
        password: form.password,
      });
      handleAuthResponse(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check username and password.');
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await api.post('/api/register/', {
        username: form.username,
        email: form.email,
        password: form.password,
      });
      handleAuthResponse(response.data, form.email);
      setMessage('Registration successful. Please check your email.');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    }
  };

  const handleLogout = async () => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/logout/', { refresh: auth.refresh });
    } catch (err) {
      console.warn('Logout endpoint failed', err);
    }
    clearSession();
    setActiveView('login');
  };

  const parseListResponse = (responseData) => {
    if (!responseData) return [];
    if (Array.isArray(responseData)) return responseData;
    if (responseData.results && Array.isArray(responseData.results)) return responseData.results;
    return [];
  };

  const normalizeRequest = (request) => {
    if (!request) return null;
    const sender = request.sender ?? request.sender_id ?? request.senderId;
    const receiver = request.receiver ?? request.receiver_id ?? request.receiverId;
    const senderId = typeof sender === 'object' ? sender.id : Number(sender);
    const receiverId = typeof receiver === 'object' ? receiver.id : Number(receiver);
    const findCachedUsername = (id) => resolveUsernameFromId(id);

    const resolvedSenderUsername = request.sender_username || (typeof sender === 'object' ? sender.username : undefined) || findCachedUsername(senderId);
    const resolvedReceiverUsername = request.receiver_username || (typeof receiver === 'object' ? receiver.username : undefined) || findCachedUsername(receiverId);

    return {
      ...request,
      id: request.id ?? request.pk ?? null,
      sender: senderId,
      receiver: receiverId,
      sender_username: resolvedSenderUsername,
      receiver_username: resolvedReceiverUsername,
      status: request.status || 'pending',
    };
  };

  const findServerRequestId = async (request) => {
    // Try to locate the numeric server-side id for a request by matching sender/receiver
    try {
      const listRes = await api.get('/api/friend-requests/', authHeaders());
      const rawList = parseListResponse(listRes.data);
      for (const raw of rawList) {
        // extract sender/receiver from raw (may be object or id)
        const s = raw.sender ?? raw.sender_id ?? raw.senderId;
        const r = raw.receiver ?? raw.receiver_id ?? raw.receiverId;
        const sId = typeof s === 'object' ? s.id : Number(s);
        const rId = typeof r === 'object' ? r.id : Number(r);
        if (Number(sId) === Number(request.sender) && Number(rId) === Number(request.receiver)) {
          // prefer numeric fields
          if (raw.id) return raw.id;
          if (raw.pk) return raw.pk;
          // sometimes serializers include a url like /api/friend-requests/123/
          if (raw.url && typeof raw.url === 'string') {
            const m = raw.url.match(/\/(\d+)\/?$/);
            if (m) return Number(m[1]);
          }
        }
      }
    } catch (e) {
      // ignore and fall through
    }
    return null;
  };

  const fetchFriendRequests = async () => {
    if (!auth.access) return;
    try {
      const response = await api.get('/api/friend-requests/', authHeaders());
      const rawRequests = parseListResponse(response.data);

      const userIds = Array.from(new Set(
        rawRequests.flatMap((request) => {
          const sender = request.sender ?? request.sender_id ?? request.senderId;
          const receiver = request.receiver ?? request.receiver_id ?? request.receiverId;
          const senderId = typeof sender === 'object' ? sender.id : Number(sender);
          const receiverId = typeof receiver === 'object' ? receiver.id : Number(receiver);
          return [senderId, receiverId];
        }).filter((id) => Number.isFinite(Number(id)) && Number(id) !== Number(currentUserId))
      ));

      await prefetchUsernames(userIds);

      const mapped = rawRequests.map(normalizeRequest).filter(Boolean);
      // dedupe by sender-receiver key
      const map = new Map();
      for (const r of mapped) {
        const key = `${r.sender}-${r.receiver}`;
        if (!map.has(key)) map.set(key, r);
      }
      const unique = Array.from(map.values());
      // keep the master list but avoid showing accepted requests
      setFriendRequests(unique.filter((r) => r.status !== 'accepted'));
      extractUsernamesFromRequests(unique);

      const incoming = unique.filter((request) => Number(request.receiver) === Number(currentUserId) && request.status !== 'accepted');
      setIncomingRequests(incoming);

      // rebuild outgoingRequests to ensure accepted requests are removed
      setOutgoingRequests((prev) => {
        const prevNormalized = (prev || []).map(normalizeOutgoingRequest);
        const resultMap = new Map(prevNormalized.map((p) => [`${p.sender}-${p.receiver}`, p]));
        for (const r of unique) {
          const key = `${r.sender}-${r.receiver}`;
          if (Number(r.sender) === Number(currentUserId)) {
            if (r.status !== 'accepted') {
              resultMap.set(key, normalizeOutgoingRequest(r));
            } else {
              resultMap.delete(key);
            }
          }
        }
        const merged = Array.from(resultMap.values()).filter((x) => x && x.status !== 'accepted');
        saveOutgoingRequests(merged);
        return merged;
      });
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        setActiveView('login');
        setError('Session expired. Please login again.');
        return;
      }
      setError(getApiError(err, 'Unable to load friend requests.'));
    }
  };

  const fetchFriendships = async () => {
    if (!auth.access) return;
    try {
      const response = await api.get('/api/friendships/', authHeaders());
      const data = parseListResponse(response.data);
      const currentFriends = data
        .filter((item) => item.user1 === currentUserId || item.user2 === currentUserId)
        .map((item) => (item.user1 === currentUserId ? item.user2 : item.user1));
      setFriends(currentFriends.map((f) => Number(f)));
      // try to populate usernames for these friends from cached sources
      const map = {};
      for (const f of currentFriends) {
        if (searchResults.find((u) => Number(u.id) === Number(f))) {
          map[Number(f)] = searchResults.find((u) => Number(u.id) === Number(f)).username;
        }
        const out = outgoingRequests.find((r) => Number(r.receiver) === Number(f));
        if (out && out.receiver_username) map[Number(f)] = out.receiver_username;
        const inc = incomingRequests.find((r) => Number(r.sender) === Number(f));
        if (inc && inc.sender_username) map[Number(f)] = inc.sender_username;
      }
      mergeUsernames(map);
      await prefetchUsernames(currentFriends);
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        setActiveView('login');
        setError('Session expired. Please login again.');
        return;
      }
      setError(getApiError(err, 'Unable to load friends.'));
    }
  };

  const fetchSearchResults = async () => {
    if (!searchQuery.trim()) {
      setSearchError('');
      setSearchResults([]);
      return;
    }
    if (!auth.access) {
      setSearchError('Login to search for users.');
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const response = await api.get('/api/search/', {
        params: { q: searchQuery.trim() },
        headers: { Authorization: `Bearer ${auth.access}` },
      });
      const results = parseListResponse(response.data);
      setSearchResults(results);
      // populate username map from search results
      const map = {};
      for (const u of results) {
        if (u.id && u.username) map[Number(u.id)] = u.username;
      }
      mergeUsernames(map);
    } catch (err) {
      setSearchError(getApiError(err, 'Unable to search users.'));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendFriendRequestToUser = async (receiverId, receiverName = '') => {
    if (!receiverId || String(receiverId) === String(currentUserId)) {
      toast.error('Cannot send a request to yourself.');
      return;
    }
    const receiverNum = Number(receiverId);
    // prevent duplicates: friend, outgoing, or incoming already exists
    if (friends.map((f) => Number(f)).includes(receiverNum)) {
      toast.info('You are already friends with this user.');
      return;
    }
    if (outgoingRequests.some((req) => Number(req.receiver) === receiverNum)) {
      toast.info('A request to this user has already been sent.');
      return;
    }
    if (incomingRequests.some((req) => Number(req.sender) === receiverNum)) {
      toast.info('This user has already sent you a request.');
      return;
    }
    if (!currentUserId) {
      const message = 'Unable to determine your user ID. Please log in again.';
      setError(message);
      toast.error(message);
      clearSession();
      setActiveView('login');
      return;
    }
    try {
      const payload = {
        sender: Number(currentUserId),
        receiver: Number(receiverId),
        status: 'pending',
      };
      const response = await api.post('/api/friend-requests/', payload);
      const label = receiverName || resolveUsernameFromId(receiverId) || 'Unknown user';
      const outgoingId = response.data?.id || Date.now();
      toast.success(`Friend request sent to ${label}.`);
      setSearchResults((prev) => prev.map((item) => item.id === receiverId ? { ...item, requestSent: true } : item));
      setOutgoingRequests((prev) => {
        const next = [
          ...prev,
          normalizeOutgoingRequest({
            id: outgoingId,
            sender: Number(currentUserId),
            receiver: Number(receiverId),
            receiver_username: label,
            status: 'pending',
          }),
        ];
        saveOutgoingRequests(next);
        return next;
      });
      await fetchFriendRequests();
    } catch (err) {
      if (err.response?.status === 401) {
        clearSession();
        setActiveView('login');
      }
      const message = getApiError(err, 'Unable to send the friend request.');
      setError(message);
      toast.error(message);
    }
  };

  const getRequestKey = (request) => {
    if (!request) return null;
    return request.id || `${request.sender}-${request.receiver}`;
  };

  const normalizeOutgoingRequest = (request) => ({
    ...normalizeRequest(request),
    sender_username: request.sender_username || resolveUsernameFromId(request.sender),
    receiver_username: request.receiver_username || resolveUsernameFromId(request.receiver),
  });

  const removeFriendRequestLocally = (request) => {
    if (!request) return;
    const key = getRequestKey(request);
    const sender = request.sender;
    const receiver = request.receiver;
    // remove both directions that match this sender/receiver pair
    setIncomingRequests((prev) => prev.filter((req) => {
      if (!req) return true;
      const s = req.sender;
      const r = req.receiver;
      return !(Number(s) === Number(sender) && Number(r) === Number(receiver)) && !(Number(s) === Number(receiver) && Number(r) === Number(sender));
    }));
    setFriendRequests((prev) => prev.filter((req) => {
      if (!req) return true;
      const s = req.sender;
      const r = req.receiver;
      return !(Number(s) === Number(sender) && Number(r) === Number(receiver)) && !(Number(s) === Number(receiver) && Number(r) === Number(sender));
    }));
    setOutgoingRequests((prev) => {
      const next = prev.filter((req) => {
        if (!req) return false;
        const s = req.sender;
        const r = req.receiver;
        return !(Number(s) === Number(sender) && Number(r) === Number(receiver)) && !(Number(s) === Number(receiver) && Number(r) === Number(sender));
      });
      saveOutgoingRequests(next);
      return next;
    });
  };

  const removeFriendRequestByPair = (senderId, receiverId) => {
    const dummy = { sender: senderId, receiver: receiverId };
    removeFriendRequestLocally(dummy);
  };

  const mergeUsernames = (map) => {
    setUsernames((prev) => ({ ...prev, ...map }));
  };

  const fetchUserById = async (userId) => {
    const id = Number(userId);
    if (!Number.isFinite(id) || id === Number(currentUserId)) return null;
    if (usernames[id]) return usernames[id];

    try {
      const response = await api.get(`/api/users/${id}/`, authHeaders());
      const user = response.data;
      if (user?.username) {
        setUsernames((prev) => ({ ...prev, [id]: user.username }));
        return user.username;
      }
    } catch (err) {
      console.warn('Unable to fetch username for user id', id, err);
    }

    return null;
  };

  const prefetchUsernames = async (ids = []) => {
    const uniqueIds = Array.from(
      new Set(
        (ids || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id !== Number(currentUserId) && !usernames[id])
      )
    );

    await Promise.all(uniqueIds.map((id) => fetchUserById(id)));
  };

  const resolveUsernameFromId = (userId) => {
    if (userId === null || userId === undefined) return null;
    const id = Number(userId);
    if (!Number.isFinite(id)) return null;
    if (id === Number(currentUserId)) return auth.username || null;

    if (usernames[id]) return usernames[id];
    const searchUser = searchResults.find((u) => Number(u.id) === id);
    if (searchUser?.username) return searchUser.username;

    const outgoing = outgoingRequests.find((req) => Number(req.receiver) === id || Number(req.sender) === id);
    if (outgoing) {
      if (Number(outgoing.receiver) === id && outgoing.receiver_username) return outgoing.receiver_username;
      if (Number(outgoing.sender) === id && outgoing.sender_username) return outgoing.sender_username;
    }

    const incoming = incomingRequests.find((req) => Number(req.receiver) === id || Number(req.sender) === id);
    if (incoming) {
      if (Number(incoming.receiver) === id && incoming.receiver_username) return incoming.receiver_username;
      if (Number(incoming.sender) === id && incoming.sender_username) return incoming.sender_username;
    }

    const friendReq = friendRequests.find((req) => Number(req.receiver) === id || Number(req.sender) === id);
    if (friendReq) {
      if (Number(friendReq.receiver) === id && friendReq.receiver_username) return friendReq.receiver_username;
      if (Number(friendReq.sender) === id && friendReq.sender_username) return friendReq.sender_username;
    }

    if (selectedConversation) {
      const other = getOtherParticipant(selectedConversation.participants);
      if (other && Number(other) === id && selectedConversation.friendUsername) {
        return selectedConversation.friendUsername;
      }
    }

    return null;
  };

  const extractUsernamesFromRequests = (requests) => {
    const map = {};
    for (const r of requests || []) {
      if (r.sender && r.sender_username) map[Number(r.sender)] = r.sender_username;
      if (r.receiver && r.receiver_username) map[Number(r.receiver)] = r.receiver_username;
      // if nested objects exist
      if (r.sender && typeof r.sender === 'object' && r.sender.username) map[Number(r.sender.id)] = r.sender.username;
      if (r.receiver && typeof r.receiver === 'object' && r.receiver.username) map[Number(r.receiver.id)] = r.receiver.username;
    }
    mergeUsernames(map);
  };

  const addProcessing = (request) => {
    const key = getRequestKey(request);
    if (!key) return;
    setProcessingRequests((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const removeProcessing = (request) => {
    const key = getRequestKey(request);
    if (!key) return;
    setProcessingRequests((prev) => prev.filter((k) => k !== key));
  };

  const isProcessing = (request) => {
    const key = getRequestKey(request);
    if (!key) return false;
    return processingRequests.includes(key);
  };

  const handleAcceptFriendRequest = async (request) => {
    if (!request) return;
    if (isProcessing(request)) return;
    addProcessing(request);
    try {
      let reqId = request.id ?? request.pk;
      if (!reqId) {
        reqId = await findServerRequestId(request);
      }
      if (reqId && Number(reqId)) {
        await api.patch(`/api/friend-requests/${reqId}/`, { status: 'accepted' }, authHeaders());
      } else {
        // fallback: create friendship record if server doesn't expose request id
        const other = Number(request.sender) === Number(currentUserId) ? Number(request.receiver) : Number(request.sender);
        await api.post('/api/friendships/', { user1: currentUserId, user2: other }, authHeaders());
      }
      // remove both directions locally
      removeFriendRequestByPair(request.sender, request.receiver);
      toast.success('Friend request accepted.');
      await fetchFriendships();
      await fetchFriendRequests();
    } catch (err) {
      if (err.response?.status === 404) {
        removeFriendRequestLocally(request);
        toast.info('Request not found — it may have been handled already.');
      } else {
        const message = getApiError(err, 'Unable to accept the request.');
        setError(message);
        toast.error(message);
      }
    } finally {
      removeProcessing(request);
    }
  };

  const handleDeclineFriendRequest = async (request) => {
    if (!request) return;
    if (isProcessing(request)) return;
    addProcessing(request);
    try {
      let reqId = request.id ?? request.pk;
      if (!reqId) {
        reqId = await findServerRequestId(request);
      }
      if (reqId && Number(reqId)) {
        await api.delete(`/api/friend-requests/${reqId}/`, authHeaders());
      } else {
        // no server id available; just remove locally and inform
        toast.info('Server did not expose request id; removed locally only.');
      }
      removeFriendRequestLocally(request);
      toast.success('Incoming request declined.');
    } catch (err) {
      if (err.response?.status === 404) {
        removeFriendRequestLocally(request);
        toast.info('Request not found — it may have been handled already.');
      } else {
        const message = getApiError(err, 'Unable to decline the request.');
        setError(message);
        toast.error(message);
      }
    } finally {
      removeProcessing(request);
    }
  };

  const handleCancelOutgoingRequest = async (request) => {
    if (!request) return;
    if (isProcessing(request)) return;
    addProcessing(request);
    try {
      let reqId = request.id ?? request.pk;
      if (!reqId) {
        reqId = await findServerRequestId(request);
      }
      if (reqId && Number(reqId)) {
        await api.delete(`/api/friend-requests/${reqId}/`, authHeaders());
      } else {
        toast.info('Server did not expose request id; removed locally only.');
      }
      removeFriendRequestLocally(request);
      toast.success('Outgoing request cancelled.');
    } catch (err) {
      if (err.response?.status === 404) {
        removeFriendRequestLocally(request);
        toast.info('Request not found — it may have been handled already.');
      } else {
        const message = getApiError(err, 'Unable to cancel the request.');
        setError(message);
        toast.error(message);
      }
    } finally {
      removeProcessing(request);
    }
  };

  const extractConversationIdFromResponse = (resp) => {
    try {
      const loc = resp.headers && (resp.headers.location || resp.headers.Location || resp.headers.LOCATION);
      if (loc && typeof loc === 'string') {
        const m = loc.match(/\/(\d+)\/?$/);
        if (m) return Number(m[1]);
      }
      const reqUrl = resp.request && (resp.request.responseURL || resp.request._currentUrl || resp.request.path || resp.request.responseURL);
      if (reqUrl && typeof reqUrl === 'string') {
        const m2 = reqUrl.match(/\/(\d+)\/?$/);
        if (m2) return Number(m2[1]);
      }
    } catch (e) {
      // ignore extraction errors
    }
    return null;
  };

  const getParticipantId = (participant) => {
    if (participant === null || participant === undefined) return null;
    if (typeof participant === 'object') {
      return Number(participant.id ?? participant.pk ?? participant.user ?? participant.user_id ?? participant);
    }
    return Number(participant);
  };

  const normalizeParticipants = (participants) => {
    if (!Array.isArray(participants)) return [];
    return participants.map(getParticipantId).filter((id) => !Number.isNaN(id));
  };

  const getUsername = (userId) => {
    if (userId === null || userId === undefined) return null;
    const id = Number(userId);
    if (!Number.isFinite(id)) return null;

    return resolveUsernameFromId(id) || 'Unknown user';
  };

  const enrichMessages = (rawMessages = []) => {
    return rawMessages.map((msg) => ({
      ...msg,
      sender_username: msg.sender === currentUserId ? 'You' : getUsername(msg.sender),
    }));
  };

  const getOtherParticipant = (participants = []) => {
    const ids = normalizeParticipants(participants);
    return ids.find((p) => Number(p) !== Number(currentUserId)) ?? null;
  };

  const findConversationForParticipants = async (a, b) => {
    try {
      const res = await api.get('/api/conversations/', authHeaders());
      const list = parseListResponse(res.data) || [];
      for (const c of list) {
        const participants = normalizeParticipants(c.participants || []);
        const aMatch = participants.some((p) => Number(p) === Number(a));
        const bMatch = participants.some((p) => Number(p) === Number(b));
        if (aMatch && bMatch) {
          const cid = c.id ?? c.pk ?? (c.url && typeof c.url === 'string' ? (c.url.match(/\/(\d+)\/?$/) || [])[1] : null);
          return {
            ...c,
            id: cid ? Number(cid) : null,
            participants,
            friendUsername: getUsername(a === currentUserId ? b : a),
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  };

  const handleStartChatWithFriend = async (friendId, friendUsername = null) => {
    if (!friendId || !currentUserId) {
      setError('Unable to start chat without a valid friend.');
      return;
    }

    const friendName = friendUsername || resolveUsernameFromId(friendId) || 'Unknown user';
    const tempConv = {
      participants: [Number(currentUserId), Number(friendId)],
      id: null,
      created_at: null,
      friendUsername: friendName,
    };

    setSelectedConversation(tempConv);
    setMessages([]);
    setUsernames((prev) => ({ ...prev, [Number(friendId)]: friendName }));

      if (!friendUsername) {
        const fetchedName = await fetchUserById(friendId);
        if (fetchedName) {
          setSelectedConversation((prev) => ({ ...prev, friendUsername: fetchedName }));
        }
      }

    if (!friends.map((f) => Number(f)).includes(Number(friendId))) {
      setFriends((prev) => [...prev.map((f) => Number(f)), Number(friendId)]);
    }
    await fetchFriendships();
  };

  const fetchMessagesForConversation = async (conversation) => {
    if (!auth.access) {
      setError('You must be logged in to load messages.');
      return;
    }
    if (!conversation) return;
    setSelectedConversation(conversation);
    try {
      if (messagesAbortControllerRef.current) {
        messagesAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      messagesAbortControllerRef.current = controller;
      const response = await api.get('/api/messages/', {
        ...authHeaders(),
        signal: controller.signal,
      });
      const allMessages = parseListResponse(response.data);
      // if conversation.id is not present, try to discover it from messages
      let convId = conversation.id ?? conversation.pk ?? null;
      if (!convId) {
        const participants = normalizeParticipants(conversation.participants || []);
        const other = participants.find((p) => Number(p) !== Number(currentUserId));
        if (other) {
          const found = allMessages.find((m) => Number(m.sender) === Number(other));
          if (found) convId = found.conversation;
        }
      }
      if (convId && !conversation.id) {
        setSelectedConversation({ ...conversation, id: Number(convId) });
      }

      const conversationMessagesRaw = convId
        ? allMessages.filter((item) => Number(item.conversation) === Number(convId)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        : [];

      const senderIds = Array.from(new Set(
        conversationMessagesRaw.map((msg) => Number(msg.sender)).filter((id) => Number.isFinite(id) && Number(id) !== Number(currentUserId))
      ));
      await prefetchUsernames(senderIds);

      const conversationMessages = convId ? enrichMessages(conversationMessagesRaw) : [];
      const otherId = getOtherParticipant(conversation.participants);
      if (otherId) {
        let otherName = conversation.friendUsername || getUsername(otherId);
        if (!otherName) {
          otherName = await fetchUserById(otherId);
        }
        if (otherName) {
          setUsernames((prev) => ({ ...prev, [Number(otherId)]: otherName }));
        }
        if (!conversation.friendUsername) {
          setSelectedConversation((prev) => ({ ...prev, friendUsername: otherName }));
        }
      }
      setMessages(conversationMessages);
    } catch (err) {
      setError(getApiError(err, 'Unable to load messages.'));
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedConversation) {
      setError('Select a conversation before sending a message.');
      return;
    }
    if (!newMessage.trim()) {
      setError('Enter a message before sending.');
      return;
    }

    let convId = selectedConversation.id;
    let createdConv = null;
    if (!convId) {
      setMessage('Creating conversation...');
      try {
        const response = await api.post('/api/conversations/', { participants: selectedConversation.participants }, authHeaders());
        createdConv = response.data || {};
        convId = extractConversationIdFromResponse(response) ?? createdConv.id ?? createdConv.pk ?? null;
      } catch (err) {
        setError(getApiError(err, 'Unable to create conversation.'));
        return;
      }
      if (!convId) {
        const participants = normalizeParticipants(selectedConversation.participants || []);
        const other = participants.find((p) => Number(p) !== Number(currentUserId));
        const start = Date.now();
        while (!convId && Date.now() - start < 3000) {
          const found = await findConversationForParticipants(currentUserId, other);
          if (found && found.id) {
            convId = found.id;
            createdConv = found;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!convId) {
        setError('Unable to create conversation. Please try again.');
        return;
      }
      const other = normalizeParticipants(selectedConversation.participants || []).find((p) => Number(p) !== Number(currentUserId));
      const friendName = selectedConversation.friendUsername || getUsername(other);
      if (other && friendName) {
        setUsernames((prev) => ({ ...prev, [Number(other)]: friendName }));
      }
      const convObj = {
        id: Number(convId),
        participants: normalizeParticipants(createdConv.participants || selectedConversation.participants),
        created_at: createdConv.created_at || selectedConversation.created_at || null,
        friendUsername: friendName,
      };
      setSelectedConversation(convObj);
    }

    try {
      const payload = {
        conversation: convId,
        sender: currentUserId,
        content: newMessage.trim(),
      };
      const response = await api.post('/api/messages/', payload, authHeaders());
      const nextMessage = enrichMessages([response.data])[0];
      setMessages((prev) => [...prev, nextMessage]);
      setNewMessage('');
      setMessage('Message sent.');
      try {
        const participants = selectedConversation.participants || [];
        const other = participants.find((p) => Number(p) !== Number(currentUserId));
        if (other && !friends.map((f) => Number(f)).includes(Number(other))) {
          setFriends((prev) => [...prev.map((f) => Number(f)), Number(other)]);
        }
      } catch (e) {
        // ignore if conversation shape is unexpected
      }
    } catch (err) {
      setError(getApiError(err, 'Unable to send message.'));
    }
  };

  const handleGoogleLogin = async (credential) => {
    setError('');
    setMessage('');
    try {
      const response = await api.post('/api/google/', { id_token: credential });
      handleAuthResponse(response.data);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.detail || err.message;
      setError(detail || 'Google login failed.');
    }
  };

  const loadGoogle = () => {
    if (!window.google) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGoogleLoadError('Google client ID is not configured in frontend/.env.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          handleGoogleLogin(response.credential);
        } else {
          setError('Google sign-in was not completed.');
        }
      },
    });
    window.google.accounts.id.renderButton(document.getElementById('google-signin'), {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
    });
    setGoogleReady(true);
  };

  useEffect(() => {
    if (window.google) {
      loadGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          loadGoogle();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <div className="app-brand">
          <div className="app-brand__label">NepChat</div>
          <div className="app-brand__subtitle">Minimal chat dashboard</div>
        </div>
        <div className="app-actions">
          {!auth.access ? (
            <>
              <button type="button" onClick={() => setActiveView('login')} className="app-btn app-btn--secondary">Login</button>
              <button type="button" onClick={() => setActiveView('register')} className="app-btn app-btn--primary">Register</button>
            </>
          ) : (
            <button type="button" onClick={handleLogout} className="app-btn app-btn--primary">Logout</button>
          )}
        </div>
      </div>

      {message && <div className="mb-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900">{message}</div>}
      {error && <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-rose-900">{error}</div>}

      {!auth.access ? (
        <div className="auth-container px-4 pb-8 pt-6 md:px-8">
          {activeView === 'login' ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="auth-card">
                <h2>Login</h2>
                <label>
                  Username
                  <input value={form.username} onChange={handleInput('username')} required />
                </label>
                <label>
                  Password
                  <input type="password" value={form.password} onChange={handleInput('password')} required />
                </label>
                <button className="app-btn app-btn--primary">Login</button>
              </div>

              <div className="auth-card">
                <h2>Google sign in</h2>
                <p className="mt-3 text-sm text-slate-600">Use your Google account for a quick login.</p>
                <div id="google-signin" className="mt-6"></div>
                {googleLoadError && <p className="mt-4 text-sm text-rose-600">{googleLoadError}</p>}
                {!googleReady && !googleLoadError && <p className="mt-4 text-sm text-slate-500">Loading Google sign-in…</p>}
              </div>
            </div>
          ) : (
            <div className="auth-card max-w-2xl">
              <h2>Register</h2>
              <label>
                Username
                <input value={form.username} onChange={handleInput('username')} required />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={handleInput('email')} required />
              </label>
              <label>
                Password
                <input type="password" value={form.password} onChange={handleInput('password')} required />
              </label>
              <button className="app-btn app-btn--primary">Register</button>
            </div>
          )}
        </div>
      ) : (
        <div className="app-body">
          <aside className="sidebar">
            <section className="panel panel--compact">
              <div className="sidebar-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Search</p>
                  <h2 className="text-lg font-semibold">Find or add people</h2>
                </div>
                <span className="status-pill">{friends.length} friends</span>
              </div>
              <div className="sidebar-search">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search username or email"
                />
              </div>
            </section>

            <section className="panel panel--compact">
              <div className="sidebar-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quick status</p>
                  <h2 className="text-lg font-semibold">Requests</h2>
                </div>
              </div>
              <div className="sidebar-stat">
                <div className="sidebar-stat-item">
                  <span>Incoming</span>
                  <span>{incomingRequests.length}</span>
                </div>
                <div className="sidebar-stat-item">
                  <span>Outgoing</span>
                  <span>{outgoingRequests.length}</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="sidebar-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Contacts</p>
                  <h2 className="text-lg font-semibold">Friends</h2>
                </div>
              </div>
              <div className="friend-list">
                {friends.length ? friends.map((friendId) => (
                  <button
                    key={friendId}
                    onClick={() => handleStartChatWithFriend(friendId, usernames[Number(friendId)])}
                    className="friend-card"
                  >
                    <div className="friend-card__info">
                      <span className="friend-card__name">{getUsername(friendId)}</span>
                      <span className="friend-card__meta">Tap to chat</span>
                    </div>
                    <span className="status-pill">Chat</span>
                  </button>
                )) : (
                  <div className="request-card">
                    <p className="text-sm text-slate-500">No friends yet. Use search to add new contacts.</p>
                  </div>
                )}
              </div>
            </section>

            {searchQuery.trim() && (
              <section className="panel">
                <div className="sidebar-header">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Search results</p>
                    <h2 className="text-lg font-semibold">Add users</h2>
                  </div>
                  <span className="status-pill">{filteredSearchResults.length} results</span>
                </div>
                <div className="contact-list">
                  {searchLoading ? (
                    <div className="request-card">Searching users…</div>
                  ) : filteredSearchResults.length ? filteredSearchResults.map((result) => {
                    const resultId = Number(result.id);
                    const friendIds = friends.map((f) => Number(f));
                    const isFriend = friendIds.includes(resultId);
                    const hasOutgoing = outgoingRequests.some((req) => Number(req.receiver) === resultId);
                    const hasIncoming = incomingRequests.some((req) => Number(req.sender) === resultId);
                    const canRequest = !isFriend && !hasOutgoing && !hasIncoming;
                    const statusLabel = isFriend
                      ? 'Friend'
                      : hasOutgoing
                      ? 'Sent'
                      : hasIncoming
                      ? 'Incoming'
                      : 'Add';

                    return (
                      <div key={result.id} className="contact-card">
                        <div className="contact-card__info">
                          <span className="contact-card__name">{result.username || 'Unknown user'}</span>
                          <span className="contact-card__meta">{result.email || 'No email'}</span>
                        </div>
                        <button
                          type="button"
                          disabled={!canRequest}
                          onClick={() => handleSendFriendRequestToUser(result.id, result.username)}
                          className={`app-btn ${canRequest ? 'app-btn--primary' : 'app-btn--secondary'}`}
                        >
                          {statusLabel}
                        </button>
                      </div>
                    );
                  }) : (
                    <div className="request-card">No results found.</div>
                  )}
                </div>
              </section>
            )}
          </aside>

          <main className="chat-panel">
            <div className="chat-header">
              <div className="chat-title">
                <p>Chat window</p>
                <h2>{selectedConversation
                  ? selectedConversation.friendUsername
                    ? selectedConversation.friendUsername
                    : selectedConversation.id
                      ? `Conversation #${selectedConversation.id}`
                      : `Chat with ${getUsername(getOtherParticipant(selectedConversation.participants))}`
                  : 'Select a friend to start messaging'}</h2>
              </div>
              {selectedConversation && (
                <button onClick={() => fetchMessagesForConversation(selectedConversation)} className="app-btn app-btn--secondary">Reload</button>
              )}
            </div>

            <div className="chat-area">
              {selectedConversation ? (
                <div className="message-group">
                  {messages.length ? messages.map((messageItem) => (
                    <div key={`${messageItem.id}-${messageItem.timestamp}`} className={`message-bubble ${messageItem.sender === currentUserId ? 'message-bubble--sent' : 'message-bubble--received'}`}>
                      <div className="message-meta">
                        <span>{messageItem.sender === currentUserId ? 'You' : messageItem.sender_username || getUsername(messageItem.sender)}</span>
                        <span>{new Date(messageItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p>{messageItem.content}</p>
                    </div>
                  )) : (
                    <div className="request-card">No messages yet. Send the first message.</div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-slate-500">
                  <p className="text-base">Your chats will appear here once you select a contact.</p>
                </div>
              )}
            </div>

            {selectedConversation && (
              <form onSubmit={handleSendMessage} className="chat-input">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={4}
                  placeholder="Type your message..."
                />
                <div className="flex justify-end">
                  <button type="submit" className="app-btn app-btn--primary">Send</button>
                </div>
              </form>
            )}
          </main>
        </div>
      )}

      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="colored"
        toastClassName="rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-xl"
        bodyClassName="font-semibold"
      />
      <footer className="footer-note">Compact, WhatsApp-inspired interface with all core features visible in one pane.</footer>
    </div>
  );
}

export default App;
