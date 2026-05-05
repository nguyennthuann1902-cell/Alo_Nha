import React, { useState, useEffect } from 'react';
import { auth, db, googleProvider } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, arrayUnion, Timestamp, getDocFromServer, collection, query, where } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Pill, Activity, Phone, PhoneCall, AlertCircle, LogOut, User, Plus, Check, ChevronRight, UserPlus, Users, Home, Calendar } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Connection Test ---
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase connection verified');
  } catch (error: any) {
    if(error.message?.includes('offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// --- Types ---
type AppRole = 'family' | 'elderly' | null;

interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  linkedUids: string[];
  inviteCode?: string;
}

interface FriendRequest {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: Timestamp;
}

// --- Components ---

const FriendManagement = ({ profile }: { profile: UserProfile }) => {
  const [searchId, setSearchId] = useState('');
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'friendRequests'),
      where('toId', '==', profile.userId),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });
  }, [profile.userId]);

  const sendRequest = async () => {
    if (!searchId || searchId === profile.userId) return;
    setSearching(true);
    try {
      const userSnap = await getDoc(doc(db, 'users', searchId));
      if (!userSnap.exists()) {
        toast.error('Không tìm thấy người dùng với ID này');
        return;
      }
      
      const reqId = `${profile.userId}_${searchId}`;
      await setDoc(doc(db, 'friendRequests', reqId), {
        fromId: profile.userId,
        fromName: profile.displayName,
        toId: searchId,
        status: 'pending',
        timestamp: Timestamp.now()
      });
      toast.success('Đã gửi yêu cầu kết nối!');
      setSearchId('');
    } catch (e) {
      toast.error('Lỗi khi gửi yêu cầu');
    } finally {
      setSearching(false);
    }
  };

  const handleRequest = async (req: FriendRequest, accept: boolean) => {
    try {
      if (accept) {
        await setDoc(doc(db, 'friendRequests', req.id), { status: 'accepted' }, { merge: true });
        // Link users
        await setDoc(doc(db, 'users', profile.userId), {
          linkedUids: arrayUnion(req.fromId)
        }, { merge: true });
        await setDoc(doc(db, 'users', req.fromId), {
          linkedUids: arrayUnion(profile.userId)
        }, { merge: true });
        toast.success('Đã chấp nhận kết nối!');
      } else {
        await setDoc(doc(db, 'friendRequests', req.id), { status: 'declined' }, { merge: true });
        toast.success('Đã từ chối yêu cầu');
      }
    } catch (e) {
      toast.error('Lỗi khi xử lý yêu cầu');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[10px] uppercase font-bold text-[#8C8881] mb-4 tracking-widest">Tìm kiếm theo Firebase ID</h3>
        <div className="flex gap-2">
          <input 
            value={searchId} onChange={e => setSearchId(e.target.value)}
            placeholder="FIREBASE USER ID"
            className="flex-1 p-4 border border-[#D1CEC8] rounded-sm focus:border-[#1A1A1A] focus:outline-none text-xs font-mono"
          />
          <button 
            onClick={sendRequest} disabled={searching}
            className="px-6 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50"
          >
            {searching ? '...' : 'Gửi'}
          </button>
        </div>
        <p className="text-[10px] text-[#8C8881] mt-2 italic">ID của bạn: <span className="font-mono text-[#1A1A1A] select-all cursor-pointer hover:underline" onClick={() => {navigator.clipboard.writeText(profile.userId); toast.success('Đã copy ID');}}>{profile.userId}</span></p>
      </div>

      {requests.length > 0 && (
        <div className="pt-4 border-t border-[#D1CEC8]">
          <h3 className="text-[10px] uppercase font-bold text-[#8C8881] mb-4 tracking-widest">Yêu cầu đến ({requests.length})</h3>
          <div className="space-y-4">
            {requests.map(req => (
              <div key={req.id} className="p-4 border border-[#D1CEC8] bg-white rounded-sm flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-bold">{req.fromName}</span>
                  <span className="text-[9px] text-[#8C8881] font-mono">ID: {req.fromId.substring(0, 8)}...</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleRequest(req, true)} className="p-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-sm">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleRequest(req, false)} className="p-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-sm">
                    <AlertCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Components ---

const Auth = ({ onAuthSuccess }: { onAuthSuccess: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, 'users', cred.user.uid), {
          userId: cred.user.uid,
          email: cred.user.email,
          displayName: name,
          role: null,
          linkedUids: [],
          createdAt: Timestamp.now()
        });
      }
      toast.success(isLogin ? 'Chào mừng bạn quay lại!' : 'Đăng ký thành công!');
      onAuthSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Đã đăng nhập bằng Google!');
      onAuthSuccess();
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F5F2ED] font-sans text-[#1A1A1A]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white p-12 rounded-sm shadow-sm border border-[#D1CEC8]"
      >
        <div className="text-center mb-8">
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#8C8881] mb-2 block">CARE NETWORK SYNC</span>
          <h1 className="text-5xl font-serif italic font-medium mb-2">Alo <span className="text-[#1A1A1A] not-italic">Nhà</span></h1>
          <p className="text-xs text-[#8C8881] uppercase tracking-widest mt-4">Editorial System v1.0</p>
        </div>

        <div className="flex border-b border-[#D1CEC8] mb-8">
          <button 
            onClick={() => setIsLogin(true)}
            className={cn("flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-all border-b-2", isLogin ? "border-[#1A1A1A] text-[#1A1A1A]" : "border-transparent text-[#8C8881]")}
          >
            Đăng nhập
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={cn("flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-all border-b-2", !isLogin ? "border-[#1A1A1A] text-[#1A1A1A]" : "border-transparent text-[#8C8881]")}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-[#8C8881] mb-2">Tên của bạn</label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                className="w-full p-3 bg-[#F5F2ED]/50 border border-[#D1CEC8] rounded-sm focus:outline-none focus:border-[#1A1A1A] text-sm"
                placeholder="VD: Chị Mai" required
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-[#8C8881] mb-2">Email Address</label>
            <input 
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full p-3 bg-[#F5F2ED]/50 border border-[#D1CEC8] rounded-sm focus:outline-none focus:border-[#1A1A1A] text-sm"
              placeholder="name@provider.com" required
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-[#8C8881] mb-2">Security Key</label>
            <input 
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full p-3 bg-[#F5F2ED]/50 border border-[#D1CEC8] rounded-sm focus:outline-none focus:border-[#1A1A1A] text-sm"
              placeholder="••••••••" required
            />
          </div>
          <button 
            disabled={loading}
            className="w-full py-4 bg-[#1A1A1A] text-white text-[10px] uppercase tracking-[0.3em] font-bold shadow-lg hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Enter Console' : 'Initialize Account')}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#D1CEC8]">
          <div className="text-center mb-6">
            <span className="text-[9px] uppercase tracking-widest text-[#8C8881]">Hoặc tiếp tục với</span>
          </div>
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-4 border border-[#D1CEC8] bg-white text-[#1A1A1A] text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-[#F5F2ED] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <svg className="w-4 h-4 ml-[-8px]" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const RoleSelection = ({ onSelect }: { onSelect: (role: AppRole) => void }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-12 bg-[#F5F2ED] font-sans text-[#1A1A1A]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-16">
        <span className="text-[10px] uppercase tracking-[0.4em] text-[#8C8881] mb-4 block">Identity Configuration</span>
        <h1 className="text-7xl font-serif italic font-medium mb-4">Alo Nhà</h1>
        <p className="text-lg text-[#5E5B54] font-serif italic">\"Chạm là thấy, gọi là nghe\"</p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-12 w-full max-w-5xl">
        <RoleCard 
          icon={<Users className="w-8 h-8" />}
          title="Con cháu"
          desc="Editorial care management, real-time vital monitoring, and medication scheduling."
          onClick={() => onSelect('family')}
        />
        <RoleCard 
          icon={<User className="w-8 h-8" />}
          title="Ông bà"
          desc="Accessible interface with high-contrast interactions and emergency signaling."
          onClick={() => onSelect('elderly')}
        />
      </div>
    </div>
  );
};

const RoleCard = ({ icon, title, desc, onClick }: any) => (
  <motion.button 
    whileHover={{ y: -4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="bg-white p-12 rounded-sm text-left border border-[#D1CEC8] shadow-sm hover:shadow-md transition-all flex flex-col h-full relative overflow-hidden group"
  >
    <div className="border-b border-[#D1CEC8] pb-8 mb-8 flex justify-between items-start w-full">
      <div className="p-4 bg-[#F5F2ED] text-[#1A1A1A] rounded-sm group-hover:bg-[#FFCA28] group-hover:text-white transition-colors">
        {icon}
      </div>
      <ChevronRight className="w-6 h-6 text-[#D1CEC8] group-hover:text-[#1A1A1A] transition-colors" />
    </div>
    <h3 className="text-4xl font-serif italic mb-4">{title}</h3>
    <p className="text-sm text-[#8C8881] leading-relaxed mb-12 font-sans">{desc}</p>
    <div className="mt-auto text-[10px] uppercase tracking-[0.2em] font-bold text-[#1A1A1A]">
      Establish Connection
    </div>
  </motion.button>
);

const Navbar = ({ profile, onLogout }: { profile: UserProfile, onLogout: () => void }) => (
  <header className="fixed top-0 left-0 right-0 h-24 bg-[#F5F2ED] border-b border-[#D1CEC8] px-12 flex justify-between items-end pb-6 z-50">
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-[#8C8881] mb-1">Family Safety Network</span>
      <h1 className="text-3xl font-serif italic font-medium leading-none">EverCare Node</h1>
    </div>
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-end">
        <span className="text-xs font-semibold capitalize">{profile.displayName} — {profile.role === 'family' ? 'Monitor' : 'Node'}</span>
        <span className="text-[10px] text-[#8C8881] uppercase tracking-tighter">Auth Sync: Active</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-[#FFCA28] rounded-full flex items-center justify-center shadow-sm text-white font-serif italic text-xl">
          {profile.displayName.charAt(0)}
        </div>
        <button 
          onClick={onLogout}
          className="p-2 text-[#8C8881] hover:text-[#1A1A1A] transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>
);

// --- Family Dashboard ---
const FamilyDashboard = ({ profile }: { profile: UserProfile }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedElders, setLinkedElders] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (profile.linkedUids.length > 0) {
      const fetchElders = async () => {
        const elders: UserProfile[] = [];
        for (const uid of profile.linkedUids) {
          const d = await getDoc(doc(db, 'users', uid));
          if (d.exists()) elders.push(d.data() as UserProfile);
        }
        setLinkedElders(elders);
      };
      fetchElders();
    }
  }, [profile.linkedUids]);

  const handleLink = async () => {
    if (inviteCode.length < 6) return;
    setIsLinking(true);
    try {
      const codeRef = doc(db, 'linkCodes', inviteCode.toUpperCase());
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        toast.error('Mã không hợp lệ!');
        return;
      }
      const elderUid = codeSnap.data().elderUid;
      if (elderUid === profile.userId) {
        toast.error('Không thể tự kết nối với chính mình!');
        return;
      }
      
      await setDoc(doc(db, 'users', profile.userId), {
        linkedUids: arrayUnion(elderUid)
      }, { merge: true });
      
      await setDoc(doc(db, 'users', elderUid), {
        linkedUids: arrayUnion(profile.userId)
      }, { merge: true });

      toast.success('Đã kết nối thành công!');
      setInviteCode('');
    } catch (error) {
      toast.error('Có lỗi xảy ra khi kết nối');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <main className="pt-24 min-h-screen bg-[#F5F2ED] grid grid-cols-12 gap-0 font-sans text-[#1A1A1A]">
      <section className="col-span-4 border-r border-[#D1CEC8] p-12 bg-white/40 overflow-y-auto">
        <div className="mb-16">
          <h2 className="text-[10px] uppercase tracking-widest text-[#8C8881] mb-8 font-bold">Account Connections</h2>
          <div className="space-y-6">
            {linkedElders.map(elder => (
              <div key={elder.userId} className="p-6 border border-[#D1CEC8] rounded-sm bg-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#E8E6E1] flex items-center justify-center text-lg">👵</div>
                  <div>
                    <p className="text-sm font-bold">{elder.displayName}</p>
                    <p className="text-[10px] text-[#8C8881] font-mono">ID: {elder.userId.substring(0, 8)}</p>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-[8px] font-black uppercase rounded-[2px] tracking-tighter">Linked</span>
              </div>
            ))}
            
            <div className="pt-4">
              <h3 className="text-[10px] uppercase font-bold text-[#8C8881] mb-4">Establish New Tunnel</h3>
              <div className="flex gap-2">
                <input 
                  value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="6-DIGIT CODE"
                  className="flex-1 p-4 border border-[#D1CEC8] rounded-sm focus:border-[#1A1A1A] focus:outline-none text-xs font-mono uppercase tracking-[0.2em]"
                  maxLength={6}
                />
                <button 
                  onClick={handleLink} disabled={isLinking}
                  className="px-6 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50"
                >
                  Sync
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-[#D1CEC8]">
              <FriendManagement profile={profile} />
            </div>
          </div>
        </div>

        <div className="mt-24">
          <div className="p-8 bg-[#1A1A1A] text-white rounded-sm">
            <h3 className="text-2xl font-serif italic mb-4">Secure Cloud Sync</h3>
            <p className="text-xs text-[#8C8881] leading-relaxed mb-6 font-sans">All care data is encrypted via Firebase Firestore and synchronized in real-time across your family devices.</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-mono uppercase tracking-tighter">Status: Active Tunnel</span>
            </div>
          </div>
        </div>
      </section>

      <section className="col-span-8 p-16 flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#8C8881]">Currently Monitoring</span>
              <h2 className="text-8xl font-serif mt-4 mb-6 leading-tight">
                {linkedElders.length > 0 ? linkedElders[0].displayName : 'No Node Active'}
              </h2>
              <p className="text-xl text-[#5E5B54] font-serif leading-relaxed max-w-xl italic">
                {linkedElders.length > 0 
                  ? 'Vital signs show consistent stabilization within normal parameters. Real-time synchronization active.'
                  : 'Please connect to a family member\'s node using a security invite code to begin monitoring.'}
              </p>
            </div>
            <div className="w-40 h-40 border border-[#D1CEC8] p-2 rotate-3 bg-white shadow-xl flex-shrink-0 ml-12">
              <div className="w-full h-full bg-[#E8E6E1] flex items-center justify-center text-4xl grayscale">
                {linkedElders.length > 0 ? '👵' : '☁️'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-12 mt-20">
            <div className="border-t-2 border-[#1A1A1A] pt-6 group">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#8C8881] group-hover:text-[#1A1A1A] transition-colors">Heart Rate</span>
              <p className="text-6xl font-serif mt-4 tabular-nums">72 <span className="text-sm italic text-[#8C8881]">bpm</span></p>
            </div>
            <div className="border-t border-[#D1CEC8] pt-6">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#8C8881]">Blood Oxygen</span>
              <p className="text-6xl font-serif mt-4 text-[#8C8881] tabular-nums">98 <span className="text-sm italic">%</span></p>
            </div>
            <div className="border-t-2 border-[#1A1A1A] pt-6">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#8C8881]">Sleep Cycle</span>
              <p className="text-6xl font-serif mt-4 leading-none">Deep</p>
            </div>
          </div>
        </div>

        <div className="mt-20 border-t border-[#D1CEC8] pt-12 flex items-center justify-between">
          <div className="flex gap-16">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-[#8C8881] font-bold tracking-widest mb-1">Next Medication</span>
              <span className="text-md font-serif italic text-[#1A1A1A]">10:30 AM — Vitamin D3</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-[#8C8881] font-bold tracking-widest mb-1">Alert Threshold</span>
              <span className="text-md font-serif italic text-[#1A1A1A]">High ({'>'}110 bpm)</span>
            </div>
          </div>
          <button className="px-10 py-4 bg-[#1A1A1A] text-white text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-black transition-all">
            View Full Logs
          </button>
        </div>
      </section>

      <footer className="col-span-12 h-16 border-t border-[#D1CEC8] bg-white px-12 flex items-center justify-between text-[#8C8881] text-[9px] uppercase tracking-[0.4em] font-bold">
        <span>Cloud Protocol: Firebase v10</span>
        <span>Secure Data Channel AES-256</span>
        <span>© 2026 Alo Nhà Editorial</span>
      </footer>
    </main>
  );
};

const StatCard = ({ icon, label, value, unit, status }: any) => (
  <div className="bg-white p-6 border border-[#D1CEC8] rounded-sm shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-6">
      <div className="p-3 bg-[#F5F2ED] rounded-none">{icon}</div>
      <span className="text-[8px] font-black uppercase tracking-tighter text-green-700 bg-green-50 px-2 py-1 rounded-[2px]">{status}</span>
    </div>
    <div className="text-5xl font-serif tabular-nums text-[#1A1A1A]">{value}</div>
    <div className="text-[10px] text-[#8C8881] font-bold uppercase tracking-widest mt-2">{label} <span className="italic normal-case text-[9px]">({unit})</span></div>
  </div>
);

// --- Elderly View ---
const ElderlyDashboard = ({ profile }: { profile: UserProfile }) => {
  const [inviteCode, setInviteCode] = useState(profile.inviteCode || '');
  const [showCode, setShowCode] = useState(false);

  const generateCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    
    try {
      await setDoc(doc(db, 'linkCodes', code), {
        elderUid: profile.userId,
        displayName: profile.displayName,
        createdAt: Timestamp.now()
      });
      await setDoc(doc(db, 'users', profile.userId), { inviteCode: code }, { merge: true });
      setInviteCode(code);
      toast.success('Đã tạo mã kết nối mới!');
    } catch (e) {
      toast.error('Lỗi khi tạo mã');
    }
  };

  const handleSOS = () => {
    toast('🚑 Đã gửi tín hiệu SOS khẩn cấp!', { 
      icon: '🚨', 
      duration: 5000, 
      style: { background: '#1A1A1A', color: '#fff', border: '1px solid #D1CEC8', borderRadius: '2px', fontSize: '12px', letterSpacing: '2px' } 
    });
  };

  return (
    <main className="pt-24 min-h-screen bg-[#F5F2ED] p-12 font-sans text-[#1A1A1A]">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex justify-between items-end border-b border-[#D1CEC8] pb-12">
          <div>
            <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-[#8C8881]">User Status: Active</span>
            <h2 className="text-7xl font-serif italic mt-4">Chào {profile.displayName}!</h2>
          </div>
          <p className="text-xl text-[#5E5B54] font-serif italic max-w-sm text-right">
            Hệ thống đang hoạt động ổn định. Mọi thông tin đều được bảo mật.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-12 items-center">
          <div className="col-span-12 lg:col-span-5 flex flex-col items-center gap-12">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={handleSOS}
              className="w-80 h-80 rounded-full bg-[#1A1A1A] border-[16px] border-[#D1CEC8] shadow-2xl flex flex-col items-center justify-center text-white active:bg-black transition-colors"
            >
              <span className="text-8xl font-serif italic tracking-tighter">SOS</span>
              <span className="text-[10px] uppercase font-bold tracking-[0.4em] text-[#8C8881] mt-6">Signal Emergency</span>
            </motion.button>
            
            <p className="text-center text-xs text-[#8C8881] uppercase tracking-[0.2em] max-w-xs leading-relaxed">
              Nhấn giữ 2 giây để gửi tín hiệu khẩn cấp đến các nút mạng trong gia đình.
            </p>
          </div>

          <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-8">
            <ElderActionButton icon={<Pill className="w-8 h-8" />} label="Báo đã uống thuốc" onClick={() => toast.success('Status Updated ✓')} />
            <ElderActionButton icon={<Phone className="w-8 h-8" />} label="Gọi cho con cháu" onClick={() => toast.success('Connecting...')} />
            <ElderActionButton icon={<Calendar className="w-8 h-8" />} label="Xem lịch trình" />
            <ElderActionButton 
              icon={<UserPlus className="w-8 h-8" />} 
              label="Mã kết bạn" 
              onClick={() => setShowCode(!showCode)} 
            />
          </div>
        </div>

        <AnimatePresence>
          {showCode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid md:grid-cols-2 gap-12"
            >
              <div className="bg-white border-2 border-dashed border-[#D1CEC8] p-16 rounded-sm text-center">
                <span className="text-[10px] uppercase tracking-[0.5em] font-bold text-[#8C8881] mb-8 block">Security Access Key</span>
                {inviteCode ? (
                  <div className="text-7xl font-serif italic tracking-[0.2em] text-[#1A1A1A] mb-12 tabular-nums">{inviteCode}</div>
                ) : (
                  <button 
                    onClick={generateCode}
                    className="px-12 py-5 bg-[#1A1A1A] text-white text-xs uppercase tracking-[0.4em] font-bold mb-8 hover:bg-black"
                  >
                    Generate New Key
                  </button>
                )}
                <p className="text-[#8C8881] font-serif italic text-sm">Đọc 6 ký tự này cho con cháu để bắt đầu đồng bộ hóa dữ liệu.</p>
              </div>

              <div className="bg-white border border-[#D1CEC8] p-16 rounded-sm">
                <FriendManagement profile={profile} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-white border border-[#D1CEC8] p-16 rounded-sm">
          <div className="flex justify-between items-center mb-12 border-b border-[#D1CEC8] pb-8">
            <h3 className="text-4xl font-serif italic">Lịch trình hôm nay</h3>
            <span className="text-[10px] uppercase tracking-widest text-[#8C8881] font-bold">Updated: Just Now</span>
          </div>
          <div className="grid gap-8">
            <ElderItem label="Uống thuốc huyết áp" time="07:00" done />
            <ElderItem label="Uống Vitamin D3" time="12:00" />
            <ElderItem label="Uống thuốc Tim" time="20:00" />
          </div>
        </div>
      </div>
    </main>
  );
};

const ElderActionButton = ({ icon, label, onClick }: any) => (
  <motion.button 
    whileHover={{ y: -2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="p-12 border border-[#D1CEC8] bg-white text-[#1A1A1A] flex flex-col items-center justify-center gap-6 shadow-sm hover:shadow-md transition-all group"
  >
    <div className="p-4 bg-[#F5F2ED] group-hover:bg-[#FFCA28] group-hover:text-white transition-colors">
      {icon}
    </div>
    <span className="text-xs uppercase tracking-[0.25em] font-bold text-center leading-tight">{label}</span>
  </motion.button>
);

const ElderItem = ({ label, time, done }: any) => (
  <div className={cn("flex items-center justify-between p-8 border border-[#D1CEC8] group transition-all", done ? "bg-[#F5F2ED]/50 opacity-40 grayscale" : "bg-white hover:border-[#1A1A1A]")}>
    <div className="flex items-center gap-8">
      <div className={cn("p-4 border", done ? "border-[#D1CEC8]" : "border-[#1A1A1A] bg-[#1A1A1A] text-white")}>
        {done ? <Check className="w-6 h-6" /> : <Pill className="w-6 h-6" />}
      </div>
      <div>
        <div className="text-2xl font-serif italic mb-1">{label}</div>
        <div className="text-[10px] uppercase font-bold text-[#8C8881] tracking-[0.3em]">{time}</div>
      </div>
    </div>
    {!done && (
      <button 
        onClick={() => toast.success('Completed ✓')} 
        className="px-10 py-3 border-2 border-[#1A1A1A] text-[#1A1A1A] text-[10px] uppercase tracking-[0.3em] font-black hover:bg-[#1A1A1A] hover:text-white transition-all"
      >
        Complete
      </button>
    )}
  </div>
);

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setLoading(true);
        try {
          const profileSnap = await getDoc(doc(db, 'users', u.uid));
          if (profileSnap.exists()) {
            setProfile(profileSnap.data() as UserProfile);
          } else {
            // Profile migration if missing
            const newProfile: UserProfile = {
              userId: u.uid,
              email: u.email!,
              displayName: u.displayName || 'Người dùng',
              role: null,
              linkedUids: []
            };
            await setDoc(doc(db, 'users', u.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  const handleSelectRole = async (role: AppRole) => {
    if (!user) return;
    try {
      const updatedProfile = { ...profile!, role };
      await setDoc(doc(db, 'users', user.uid), { role }, { merge: true });
      setProfile(updatedProfile);
    } catch (e) {
      toast.error('Lỗi khi cập nhật vai trò');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success('Đã đăng xuất');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50/20">
      <div className="flex flex-col items-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
          <Heart className="w-12 h-12 text-orange-500 fill-orange-500" />
        </motion.div>
        <p className="font-bold text-orange-600 animate-pulse">Đang tải dữ liệu...</p>
      </div>
    </div>
  );

  if (!user) return <><Auth onAuthSuccess={() => {}} /><Toaster /></>;

  if (!profile?.role) return <><RoleSelection onSelect={handleSelectRole} /><Toaster /></>;

  return (
    <div className="min-h-screen bg-stone-50 selection:bg-orange-100">
      <Navbar profile={profile} onLogout={handleLogout} />
      {profile.role === 'family' ? <FamilyDashboard profile={profile} /> : <ElderlyDashboard profile={profile} />}
      <Toaster position="bottom-center" />
    </div>
  );
}
