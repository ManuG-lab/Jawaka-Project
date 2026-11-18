import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { getMenuItemImage } from '../data/menuImages';
import { MenuItem } from '../types';

interface MenuFoodImageProps {
  item: Pick<MenuItem, 'id' | 'name' | 'category'>;
  className?: string;
}

export function MenuFoodImage({ item, className = '' }: MenuFoodImageProps) {
  const [failed, setFailed] = useState(false);
  const src = getMenuItemImage(item);

  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-[#F3ECE0] to-[#E6DDD0] flex flex-col items-center justify-center text-[#61554C] p-2 ${className}`}
        aria-label={item.name}
      >
        <UtensilsCrossed className="w-5 h-5 mb-1 opacity-75" />
        <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
          {item.name}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover bg-[#F3ECE0] ${className}`}
    />
  );
}
