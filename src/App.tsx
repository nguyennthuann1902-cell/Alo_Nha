import React, { useState, useEffect } from 'react';
import { auth, db, googleProvider } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, arrayUnion, Timestamp, getDocFromServer, collection, query, where, orderBy, limit } from 'firebase/firestore';
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

interface AppActivity {
  id: string;
  fromUid: string;
  fromName: string;
  toUids: string[];
  type: 'sos' | 'medicine' | 'heart' | 'call';
  message: string;
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8F9FA] font-sans text-[#2D3436]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white p-10 rounded-2xl shadow-xl border border-[#DFE6E9]"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#FFCA28] rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <Home className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-2">Alo Nhà</h1>
          <p className="text-[#636E72] font-medium text-lg italic">"Kết nối yêu thương"</p>
        </div>

        <div className="flex gap-2 mb-8 bg-[#F1F2F6] p-1.5 rounded-xl">
          <button 
            onClick={() => setIsLogin(true)}
            className={cn("flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all", isLogin ? "bg-white text-[#2D3436] shadow-md" : "text-[#636E72]")}
          >
            Đăng nhập
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={cn("flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all", !isLogin ? "bg-white text-[#2D3436] shadow-md" : "text-[#636E72]")}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-sm font-bold text-[#2D3436] mb-2 uppercase tracking-wide">Tên của bạn</label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                className="w-full p-4 bg-[#F8F9FA] border-2 border-[#DFE6E9] rounded-xl focus:outline-none focus:border-[#FFCA28] text-lg font-medium transition-colors"
                placeholder="VD: Chị Mai" required
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-[#2D3436] mb-2 uppercase tracking-wide">Email</label>
            <input 
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full p-4 bg-[#F8F9FA] border-2 border-[#DFE6E9] rounded-xl focus:outline-none focus:border-[#FFCA28] text-lg font-medium transition-colors"
              placeholder="ten@ví-dụ.com" required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#2D3436] mb-2 uppercase tracking-wide">Mật khẩu</label>
            <input 
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full p-4 bg-[#F8F9FA] border-2 border-[#DFE6E9] rounded-xl focus:outline-none focus:border-[#FFCA28] text-lg font-medium transition-colors"
              placeholder="••••••••" required
            />
          </div>
          
          <button 
            disabled={loading}
            className="w-full py-5 bg-[#2D3436] text-white rounded-xl font-bold text-lg shadow-lg hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : (isLogin ? 'Đăng nhập' : 'Tạo tài khoản')}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#DFE6E9]">
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-4 border-2 border-[#DFE6E9] bg-white text-[#2D3436] font-bold rounded-xl hover:bg-[#F8F9FA] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebase/anonymous-scan/google.svg" alt="Google" className="w-6 h-6" />
            Đăng nhập với Google
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const RoleSelection = ({ onSelect }: { onSelect: (role: AppRole) => void }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F1F2F6] font-sans text-[#2D3436]">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-6xl font-display font-bold text-[#2D3436] mb-4">Alo Nhà</h1>
        <p className="text-2xl text-[#636E72] font-medium italic">"Chạm là thấy, gọi là nghe"</p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        <RoleCard 
          icon={<Users className="w-12 h-12" />}
          title="Con cháu"
          desc="Theo dõi sức khỏe, lịch uống thuốc và chăm sóc người thân"
          onClick={() => onSelect('family')}
          color="blue"
        />
        <RoleCard 
          icon={<User className="w-12 h-12" />}
          title="Ông bà"
          desc="Giao diện lớn, nút bấm to, báo uống thuốc và gọi khẩn cấp"
          onClick={() => onSelect('elderly')}
          color="orange"
        />
      </div>
    </div>
  );
};

const RoleCard = ({ icon, title, desc, onClick, color }: any) => (
  <motion.button 
    whileHover={{ y: -10, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="bg-white p-10 rounded-[40px] text-center shadow-2xl border-4 border-transparent hover:border-[#FFCA28] transition-all flex flex-col items-center h-full group"
  >
    <div className={cn("w-24 h-24 rounded-3xl flex items-center justify-center mb-8 shadow-sm transition-transform group-hover:scale-110", color === 'blue' ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600")}>
      {icon}
    </div>
    <h3 className="text-4xl font-display font-bold text-[#2D3436] mb-4">{title}</h3>
    <p className="text-lg text-[#636E72] leading-relaxed mb-10 font-medium">{desc}</p>
    <div className="mt-auto bg-[#2D3436] text-white py-4 px-8 rounded-2xl font-bold text-lg shadow-md group-hover:bg-black">
      Bắt đầu ngay
    </div>
  </motion.button>
);

const Navbar = ({ profile, onLogout }: { profile: UserProfile, onLogout: () => void }) => (
  <header className="fixed top-0 left-0 right-0 h-20 bg-white border-b-2 border-[#DFE6E9] px-6 md:px-12 flex justify-between items-center z-50">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-[#FFCA28] rounded-xl flex items-center justify-center shadow-sm">
        <Home className="w-6 h-6 text-white" />
      </div>
      <h1 className="text-2xl font-display font-bold text-[#2D3436]">Alo Nhà</h1>
    </div>
    <div className="flex items-center gap-4 md:gap-8">
      <div className="hidden md:flex flex-col items-end">
        <span className="text-sm font-bold text-[#2D3436]">{profile.displayName}</span>
        <span className="text-[10px] text-[#636E72] font-bold uppercase tracking-wider">{profile.role === 'family' ? 'Người thân' : 'Ông bà'}</span>
      </div>
      <button 
        onClick={onLogout}
        className="p-3 bg-[#F1F2F6] text-[#636E72] hover:text-red-500 rounded-xl transition-all"
        title="Đăng xuất"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  </header>
);

// --- Family Dashboard ---
const FamilyDashboard = ({ profile }: { profile: UserProfile }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedElders, setLinkedElders] = useState<UserProfile[]>([]);
  const [activities, setActivities] = useState<AppActivity[]>([]);

  useEffect(() => {
    if (!profile.linkedUids || profile.linkedUids.length === 0) return;

    // Listen to activities targeting this user
    const q = query(
      collection(db, 'activities'),
      where('toUids', 'array-contains', profile.userId),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const newActs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppActivity));
      setActivities(newActs);
      
      // Urgent SOS toast for family
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const act = change.doc.data() as AppActivity;
          if (act.type === 'sos') {
            toast.error(`🆘 KHẨN CẤP: ${act.fromName} nhấn SOS!`, { duration: 10000, position: 'top-center' });
          } else if (act.type === 'medicine') {
             toast.success(`💊 ${act.fromName} đã báo uống thuốc`, { position: 'bottom-right' });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [profile.userId, profile.linkedUids]);

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
        toast.error('Không thể tự kết nối!');
        return;
      }
      
      await setDoc(doc(db, 'users', profile.userId), {
        linkedUids: arrayUnion(elderUid)
      }, { merge: true });
      
      await setDoc(doc(db, 'users', elderUid), {
        linkedUids: arrayUnion(profile.userId)
      }, { merge: true });

      toast.success('Kết nối thành công!');
      setInviteCode('');
    } catch (error) {
      toast.error('Lỗi khi kết nối');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <main className="pt-20 min-h-screen bg-[#F8F9FA] flex flex-col lg:flex-row font-sans text-[#2D3436]">
      {/* Sidebar: Connections - Moved to bottom on mobile, side on desktop */}
      <aside className="w-full lg:w-96 bg-white border-b-2 lg:border-b-0 lg:border-r-2 border-[#DFE6E9] p-6 md:p-8 order-2 lg:order-1">
        <div className="mb-12">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#636E72] mb-6">Đang quan tâm</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {linkedElders.map(elder => (
              <div key={elder.userId} className="p-4 bg-[#F8F9FA] rounded-2xl border border-[#DFE6E9] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-xl shrink-0">👵</div>
                <div className="min-w-0">
                  <p className="font-bold text-[#2D3436] truncate">{elder.displayName}</p>
                  <p className="text-[10px] font-mono text-[#636E72] uppercase truncate">ID: {elder.userId.substring(0, 8)}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-6 mt-6 border-t border-[#DFE6E9]">
            <h3 className="text-[10px] font-black uppercase text-[#636E72] mb-4">Thêm người thân mới</h3>
            <div className="flex gap-2">
              <input 
                value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="MÃ 6 SỐ"
                className="flex-1 p-3 bg-[#F8F9FA] border-2 border-[#DFE6E9] rounded-xl focus:border-[#FFCA28] focus:outline-none text-sm font-mono uppercase tracking-[0.2em]"
                maxLength={6}
              />
              <button 
                onClick={handleLink} disabled={isLinking}
                className="px-5 bg-[#2D3436] text-white rounded-xl font-bold hover:bg-black transition-colors disabled:opacity-50 shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[10px] text-[#636E72] mt-2 italic">Nhập mã an toàn từ máy ông bà</p>
          </div>

          <div className="pt-8 mt-8 border-t border-[#DFE6E9]">
            <FriendManagement profile={profile} />
          </div>
        </div>
      </aside>

      {/* Main Content: Stats */}
      <section className="flex-1 p-6 md:p-12 overflow-y-auto order-1 lg:order-2">
        {linkedElders.length > 0 ? (
          <div className="max-w-4xl mx-auto">
            <header className="mb-10 text-center lg:text-left">
              <span className="text-sm font-black uppercase tracking-widest text-orange-500">Đang theo dõi</span>
              <h2 className="text-4xl md:text-6xl font-display font-bold text-[#2D3436] mt-4 mb-4">
                {linkedElders[0].displayName}
              </h2>
              <div className="flex items-center justify-center lg:justify-start gap-2 text-[#636E72] font-medium">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Hoạt động: Vừa xong</span>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-12">
              <StatCard2 icon={<Heart className="w-6 h-6 text-red-500" />} label="Nhịp tim" value="72" unit="bpm" color="red" />
              <StatCard2 icon={<Activity className="w-6 h-6 text-blue-500" />} label="Oxy máu" value="98" unit="%" color="blue" />
              <StatCard2 icon={<Activity className="w-6 h-6 text-green-500" />} label="Giấc ngủ" value="Sâu" unit="" color="green" />
            </div>

            <div className="bg-white p-8 rounded-3xl border-2 border-[#DFE6E9] shadow-sm">
              <h3 className="text-xl font-bold mb-6 text-[#2D3436]">Thông báo mới nhất</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {activities.length > 0 ? (
                  activities.map(act => (
                    <div key={act.id} className={cn(
                      "p-4 rounded-xl border flex gap-4 items-start",
                      act.type === 'sos' ? "bg-red-50 border-red-200" : "bg-[#F8F9FA] border-[#DFE6E9]"
                    )}>
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                        act.type === 'sos' ? "bg-red-500 text-white" : "bg-[#2D3436] text-white"
                      )}>
                        {act.type === 'sos' ? <AlertCircle className="w-5 h-5" /> : 
                         act.type === 'medicine' ? <Pill className="w-5 h-5" /> : 
                         act.type === 'call' ? <Phone className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-sm">
                          {act.fromName} <span className="font-normal opacity-70">là {act.message}</span>
                        </p>
                        <p className="text-[10px] text-[#636E72] mt-1 italic">
                          {act.timestamp.toDate().toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-[#636E72] py-8 italic">Chưa có hoạt động nào</p>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border-2 border-[#DFE6E9] shadow-sm mt-6">
              <h3 className="text-xl font-bold mb-6 text-[#2D3436]">Lịch trình & Thuốc</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl border border-[#DFE6E9]">
                  <div className="flex items-center gap-4">
                    <Pill className="text-orange-500" />
                    <div>
                      <p className="font-bold">Vitamin D3</p>
                      <p className="text-xs text-[#636E72]">Hẹn: 10:30 AM</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">Sắp tới</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-24 h-24 bg-white rounded-3xl border-2 border-dashed border-[#DFE6E9] flex items-center justify-center mb-8 text-4xl grayscale">☁️</div>
            <h2 className="text-3xl font-display font-bold text-[#2D3436] mb-4">Chưa có kết nối nào</h2>
            <p className="text-[#636E72] text-lg leading-relaxed">Vui lòng nhập mã an toàn từ máy của người thân để bắt đầu theo dõi sức khỏe.</p>
          </div>
        )}
      </section>
    </main>
  );
};

const StatCard2 = ({ icon, label, value, unit, color }: any) => (
  <div className="bg-white p-6 rounded-[32px] border-2 border-[#DFE6E9] shadow-sm hover:shadow-md transition-shadow">
    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6", 
      color === 'red' ? 'bg-red-50' : color === 'blue' ? 'bg-blue-50' : 'bg-green-50')}>
      {icon}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-5xl font-display font-bold text-[#2D3436]">{value}</span>
      <span className="text-lg font-medium text-[#636E72] italic">{unit}</span>
    </div>
    <div className="text-xs font-black uppercase tracking-widest text-[#636E72] mt-4">{label}</div>
  </div>
);

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
    const chars = '0123456789';
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
      toast.success('Mã mới đã sẵn sàng');
    } catch (e) {
      toast.error('Lỗi khi tạo mã');
    }
  };

  const logActivity = async (type: AppActivity['type'], message: string) => {
    if (!profile.linkedUids || profile.linkedUids.length === 0) {
      toast.error('Chưa kết nối với con cháu để gửi thông báo');
      return;
    }
    try {
      await setDoc(doc(collection(db, 'activities')), {
        fromUid: profile.userId,
        fromName: profile.displayName,
        toUids: profile.linkedUids,
        type,
        message,
        timestamp: Timestamp.now()
      });
    } catch (e) {
      console.error('Lỗi gửi thông báo:', e);
    }
  };

  const handleSOS = () => {
    logActivity('sos', 'CẦN GIÚP ĐỠ KHẨN CẤP!');
    toast('🚑 Đã báo động SOS cho gia đình!', { 
      icon: '🆘', 
      duration: 8000, 
      style: { background: '#D63031', color: '#fff', borderRadius: '24px', fontSize: '24px', fontWeight: 'bold' } 
    });
  };

  return (
    <main className="pt-20 min-h-screen bg-[#F1F2F6] p-4 md:p-8 font-sans text-[#2D3436]">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div className="bg-white p-6 md:p-8 rounded-[32px] md:rounded-[40px] shadow-sm border-2 border-[#DFE6E9] flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-balance">Chào {profile.displayName}!</h2>
            <p className="text-lg md:text-xl text-[#636E72] font-medium mt-2">Hôm nay ông bà thấy thế nào?</p>
          </div>
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={handleSOS}
            className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-red-600 border-8 border-red-200 shadow-2xl flex flex-col items-center justify-center text-white active:bg-red-800 transition-all shrink-0"
          >
            <span className="text-3xl md:text-4xl font-black">CỨU HỘ</span>
            <span className="text-lg md:text-xl font-bold">S.O.S</span>
          </motion.button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          <ElderActionButton 
            icon={<Pill className="w-10 h-10" />} 
            label="Báo đã uống thuốc" 
            onClick={() => {
              logActivity('medicine', 'Đã uống thuốc đúng giờ');
              toast.success('Đã báo cho con cháu ✓', { style: { fontSize: '20px', borderRadius: '20px' } });
            }} 
            color="blue" 
          />
          <ElderActionButton 
            icon={<PhoneCall className="w-10 h-10" />} 
            label="Gọi cho con" 
            onClick={() => {
              logActivity('call', 'Muốn trò chuyện video');
              toast.success('Đang gửi yêu cầu gọi...', { style: { fontSize: '20px', borderRadius: '20px' } });
            }} 
            color="green" 
          />
          <ElderActionButton icon={<UserPlus className="w-10 h-10" />} label="Mã kết nối" onClick={() => setShowCode(!showCode)} color="orange" />
          <ElderActionButton 
            icon={<Heart className="w-10 h-10" />} 
            label="Nhịp tim" 
            onClick={() => logActivity('heart', 'Kiểm tra nhịp tim: 72bpm')}
            color="red" 
          />
        </div>

        <AnimatePresence>
          {showCode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 rounded-[40px] border-4 border-dashed border-[#DFE6E9] text-center"
            >
              <h3 className="text-2xl font-bold mb-6">Mã an toàn của ông bà</h3>
              {inviteCode ? (
                <div className="text-7xl font-mono font-black tracking-widest text-[#2D3436] mb-8 bg-[#F8F9FA] p-6 rounded-2xl">{inviteCode}</div>
              ) : (
                <button onClick={generateCode} className="px-10 py-5 bg-[#2D3436] text-white rounded-2xl font-bold text-xl mb-6 shadow-lg">Tạo mã mới</button>
              )}
              <p className="text-lg text-[#636E72] font-medium leading-relaxed">Đọc 6 số này cho con cháu để họ theo dõi sức khỏe cho mình.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-white p-8 rounded-[40px] border-2 border-[#DFE6E9] shadow-sm">
          <h3 className="text-3xl font-display font-bold mb-8 text-center underline decoration-[#FFCA28] underline-offset-8">Nhắc nhở hôm nay</h3>
          <div className="space-y-6">
            <ElderItem label="Uống thuốc Huyết áp" time="Buổi sáng" done />
            <ElderItem label="Uống Vitamin D3" time="Buổi trưa" />
            <ElderItem label="Uống thuốc Tim" time="Buổi tối" />
          </div>
        </div>
      </div>
    </main>
  );
};

const ElderActionButton = ({ icon, label, onClick, color }: any) => (
  <motion.button 
    whileHover={{ y: -5, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="p-6 md:p-8 bg-white border-4 border-transparent hover:border-[#FFCA28] rounded-[32px] md:rounded-[40px] shadow-lg flex flex-col items-center justify-center gap-4 transition-all group"
  >
    <div className={cn("w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl flex items-center justify-center", 
      color === 'blue' ? 'bg-blue-100 text-blue-600' : 
      color === 'green' ? 'bg-green-100 text-green-600' : 
      color === 'orange' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600')}>
      {icon}
    </div>
    <span className="text-xl md:text-2xl font-bold text-center text-[#2D3436]">{label}</span>
  </motion.button>
);

const ElderItem = ({ label, time, done }: any) => (
  <div className={cn("flex flex-col sm:flex-row items-center justify-between p-6 rounded-[32px] border-2 transition-all gap-4", 
    done ? "bg-[#F8F9FA] border-[#DFE6E9] opacity-60" : "bg-white border-[#DFE6E9] shadow-sm")}>
    <div className="flex items-center gap-6 w-full sm:w-auto">
      <div className={cn("w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-2xl flex items-center justify-center", done ? "bg-gray-200 text-gray-500" : "bg-[#2D3436] text-white shadow-lg")}>
        {done ? <Check className="w-6 h-6 md:w-8 md:h-8" /> : <Pill className="w-6 h-6 md:w-8 md:h-8" />}
      </div>
      <div>
        <div className="text-xl md:text-2xl font-bold text-[#2D3436]">{label}</div>
        <div className="text-md md:text-lg font-medium text-[#636E72]">{time}</div>
      </div>
    </div>
    {!done && (
      <button 
        onClick={() => toast.success('Tuyệt vời ✓', { style: { fontSize: '24px', borderRadius: '24px' } })} 
        className="w-full sm:w-auto px-8 py-4 bg-[#FFCA28] text-[#2D3436] rounded-2xl font-black text-xl shadow-md active:scale-95 transition-all"
      >
        Xong
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
