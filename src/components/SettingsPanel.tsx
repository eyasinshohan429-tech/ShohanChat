import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { getDisplayName } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import { isSoundEnabled, setSoundEnabled, playMessageSound } from '@/lib/sound';
import {
  ArrowLeft,
  Camera,
  Loader2,
  Moon,
  Sun,
  LogOut,
  User as UserIcon,
  Shield,
  Bell,
  Palette,
  Check,
  Trash2,
  AlertTriangle,
  UserCog,
  Crown,
} from 'lucide-react';

interface SettingsPanelProps {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { user, profile, signOut, refreshProfile, deleteAccount, isAdmin, deleteUserAsAdmin } = useAuth();
  const [allUsers, setAllUsers] = useState<Array<{ id: string; display_name: string; email: string; online: boolean; is_admin: boolean }>>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [adminDeleting, setAdminDeleting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        bio: bio,
      })
      .eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);

    const ext = file.name.split('.').pop() ?? 'jpg';
    const fileName = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);

    await supabase
      .from('profiles')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', user.id);

    await refreshProfile();
    setUploadingAvatar(false);
    if (e.target) e.target.value = '';
  };

  const currentName = profile ? getDisplayName(profile.display_name, user?.email ?? '') : '';

  const loadAllUsers = async () => {
    const { data, error } = await supabase.rpc('admin_get_all_users');
    if (!error && data) {
      setAllUsers(data as Array<{ id: string; display_name: string; email: string; online: boolean; is_admin: boolean; created_at: string }>);
    }
  };

  const handleAdminDeleteUser = async () => {
    if (!adminDeleteTarget) return;
    setAdminDeleting(true);
    setAdminError(null);
    const { error } = await deleteUserAsAdmin(adminDeleteTarget.id);
    if (error) {
      setAdminError(error);
      setAdminDeleting(false);
    } else {
      setAdminDeleteTarget(null);
      setAdminDeleting(false);
      loadAllUsers();
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccount();
    if (error) {
      setDeleteError(error);
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Settings</h1>
      </div>

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-6">
        {/* Profile section */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
            <UserIcon className="w-4 h-4" />
            Profile
          </h2>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6">
            {/* Avatar */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative">
                <Avatar src={profile?.avatar_url} name={currentName} size="xl" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-brand-500 hover:bg-brand-600 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-slate-800 transition-colors"
                  title="Change photo"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            {/* Display name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>

            {/* Bio */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell something about yourself..."
                rows={3}
                maxLength={200}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">{bio.length}/200</p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-medium rounded-xl shadow-lg shadow-brand-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
            <Palette className="w-4 h-4" />
            Appearance
          </h2>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                {theme === 'light' ? <Moon className="w-5 h-5 text-slate-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Theme</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Currently {theme === 'light' ? 'Light' : 'Dark'} mode
                  </p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-brand-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>
        </section>

        {/* Privacy */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
            <Shield className="w-4 h-4" />
            Privacy
          </h2>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-1">
            <button
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playMessageSound();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-slate-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Message Sound</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {soundOn ? 'Plays a sound for new messages' : 'Muted'}
                  </p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors relative ${soundOn ? 'bg-brand-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${soundOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </button>
            <div className="flex items-center justify-between p-3 rounded-xl">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-slate-500" />
                <p className="text-sm font-medium text-slate-900 dark:text-white">Online Status</p>
              </div>
              <span className="text-xs text-green-500">Visible</span>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
            Account
          </h2>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
            <div className="px-3 py-2 mb-2">
              <p className="text-xs text-slate-400 mb-0.5">Email</p>
              <p className="text-sm text-slate-900 dark:text-white">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
            <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              <span className="text-sm font-medium">Delete Account</span>
            </button>
          </div>
        </section>

        {/* Admin panel (only for admin users) */}
        {isAdmin && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
              <Crown className="w-4 h-4 text-amber-500" />
              Admin Controls
            </h2>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
              <button
                onClick={() => { setShowAdminPanel(true); loadAllUsers(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <UserCog className="w-5 h-5 text-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Manage Users</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">View and delete any user</p>
                </div>
              </button>
            </div>
          </section>
        )}

        <div className="text-center py-4">
          <p className="text-xs text-slate-400">ShohanChat v1.0</p>
        </div>
      </div>

      {/* Admin User Management Panel */}
      {showAdminPanel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                User Management
              </h2>
              <button
                onClick={() => setShowAdminPanel(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-1">
              {allUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white ${u.is_admin ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-slate-400 to-slate-600'}`}>
                    {(u.display_name || u.email || '?')[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {u.display_name || u.email}
                      </p>
                      {u.is_admin && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">ADMIN</span>
                      )}
                      {u.id === user?.id && (
                        <span className="text-[10px] font-medium text-slate-400">(You)</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                  </div>
                  {!u.is_admin && u.id !== user?.id && (
                    <button
                      onClick={() => { setAdminDeleteTarget({ id: u.id, name: u.display_name || u.email }); setAdminError(null); }}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-500 transition-colors"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Admin delete user confirmation */}
      {adminDeleteTarget && (
        <div className="fixed inset-0 z-[71] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <UserCog className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete user?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Permanently delete <span className="font-semibold text-slate-700 dark:text-slate-300">{adminDeleteTarget.name}</span> and all their data?
              </p>
              {adminError && <p className="text-sm text-red-500 mb-4 w-full text-left">{adminError}</p>}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setAdminDeleteTarget(null); setAdminError(null); }}
                  disabled={adminDeleting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminDeleteUser}
                  disabled={adminDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {adminDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete user'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Account?</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                This will permanently delete your account, all your messages, conversations, and call history. This action cannot be undone.
              </p>
              <div className="w-full mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Type <span className="font-bold text-red-500">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-500 mb-4 w-full text-left">{deleteError}</p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(null); }}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirm !== 'DELETE'}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Forever'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
