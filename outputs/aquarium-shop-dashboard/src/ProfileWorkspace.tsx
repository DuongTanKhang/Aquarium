import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "./ui";

export interface AdminProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  role: string;
  avatar: string;
}

export const DEFAULT_ADMIN_PROFILE: AdminProfile = {
  name: "Alex Le",
  email: "barbiecute306@gmail.com",
  phone: "",
  location: "Aquarium Shop",
  role: "Administrator",
  avatar: "",
};

interface ProfileWorkspaceProps {
  profile: AdminProfile;
  onSave: (profile: AdminProfile) => void;
  onBack: () => void;
  onLogout: () => void;
}

function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AL";
  return words.slice(-2).map((word) => word[0]).join("").toUpperCase();
}

export default function ProfileWorkspace({
  profile,
  onSave,
  onBack,
  onLogout,
}: ProfileWorkspaceProps) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const update = <K extends keyof AdminProfile>(key: K, value: AdminProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Choose a PNG, JPG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be smaller than 5 MB to save on this device.");
      return;
    }
    setImageError("");
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") update("avatar", reader.result);
    });
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextProfile = { ...draft, name: draft.name.trim() || "Alex Le" };
    onSave(nextProfile);
    setDraft(nextProfile);
    setSaved(true);
  };

  return (
    <section className="profile-workspace">
      <div className="profile-heading">
        <div>
          <span className="panel-kicker">ACCOUNT</span>
          <h1>Admin profile</h1>
          <p>Keep the administrator&apos;s contact details and profile photo up to date.</p>
        </div>
        <button className="profile-back" onClick={onBack} type="button">
          ← Back to dashboard
        </button>
      </div>

      <div className="profile-layout">
        <article className="profile-card profile-summary-card">
          <div className="profile-cover" />
          <div className="profile-summary-body">
            <button
              className="profile-avatar-large"
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Change profile photo"
              title="Change profile photo"
            >
              {draft.avatar ? <img src={draft.avatar} alt="Admin avatar" /> : <span>{profileInitials(draft.name)}</span>}
              <i><Icon name="upload" size={15} /></i>
            </button>
            <h2>{draft.name || "Alex Le"}</h2>
            <p>{draft.role}</p>
            <span className="profile-status"><i /> Active admin account</span>
            <button className="profile-photo-button" type="button" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={14} /> Change photo
            </button>
            {draft.avatar && <button className="profile-remove-photo" type="button" onClick={() => update("avatar", "")}>Remove photo</button>}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={handleAvatarChange} hidden />
            {imageError && <span className="profile-image-error" role="alert">{imageError}</span>}
            <div className="profile-summary-meta">
              <span><Icon name="users" size={14} /> One admin workspace</span>
              <span><Icon name="check" size={14} /> Secure session enabled</span>
            </div>
          </div>
        </article>

        <form className="profile-card profile-form-card" onSubmit={handleSubmit}>
          <div className="profile-card-heading">
            <div><span className="panel-kicker">PERSONAL DETAILS</span><h2>Profile information</h2></div>
            <span className="profile-edit-badge"><Icon name="check" size={13} /> Editable</span>
          </div>
          <div className="profile-fields">
            <label>Full name<input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Alex Le" maxLength={80} required /></label>
            <label>Email address<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} placeholder="admin@aquarium.shop" maxLength={160} required /></label>
            <label>Phone number<input type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+84 90 123 4567" maxLength={30} /></label>
            <label>Shop location<input value={draft.location} onChange={(event) => update("location", event.target.value)} placeholder="Aquarium Shop" maxLength={120} /></label>
            <label className="profile-readonly">Role<input value={draft.role} readOnly aria-readonly="true" /></label>
          </div>
          <div className="profile-form-foot">
            <span>{saved ? "Saved on this device." : "Profile details are stored locally in this browser."}</span>
            <button className="profile-save" type="submit"><Icon name="check" size={15} /> Save changes</button>
          </div>
          <div className="profile-account-actions">
            <div><strong>Sign out</strong><span>End the current admin session on this device.</span></div>
            <button type="button" onClick={onLogout}>Sign out</button>
          </div>
        </form>
      </div>
    </section>
  );
}
