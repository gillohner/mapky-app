import { useState } from "react";
import { User } from "lucide-react";
import { getPubkyAvatarUrl } from "@/lib/api/user";

interface UserAvatarProps {
  userId: string;
  /** Tailwind size (e.g. 6 → h-6 w-6). Default 8. */
  size?: 5 | 6 | 7 | 8 | 10;
  className?: string;
}

const sizeClasses: Record<number, { outer: string; icon: string }> = {
  5: { outer: "h-5 w-5", icon: "h-2.5 w-2.5" },
  6: { outer: "h-6 w-6", icon: "h-3 w-3" },
  7: { outer: "h-7 w-7", icon: "h-3.5 w-3.5" },
  8: { outer: "h-8 w-8", icon: "h-4 w-4" },
  10: { outer: "h-10 w-10", icon: "h-5 w-5" },
};

// Cache failed avatar URLs globally so we don't retry on re-renders
const failedAvatars = new Set<string>();

export function UserAvatar({ userId, size = 8, className = "" }: UserAvatarProps) {
  const url = getPubkyAvatarUrl(userId);
  const [imgError, setImgError] = useState(() => failedAvatars.has(url));
  const s = sizeClasses[size] ?? sizeClasses[8];

  if (imgError) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-accent-subtle ${s.outer} ${className}`}
      >
        <User className={`${s.icon} text-accent`} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`rounded-full object-cover ${s.outer} ${className}`}
      onError={() => {
        failedAvatars.add(url);
        setImgError(true);
      }}
    />
  );
}
