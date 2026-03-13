import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  place_id: number;
  display_name: string;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Search location...",
  className = ""
}) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query || query.length < 3 || query === value) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
        );
        if (response.ok) {
          const data = await response.json();
          const formattedSuggestions = data.features.map((feature: any) => {
            const props = feature.properties;
            const parts = [props.name, props.city, props.state, props.country].filter(Boolean);
            // Remove duplicates from parts
            const uniqueParts = Array.from(new Set(parts));
            return {
              place_id: props.osm_id || Math.random(),
              display_name: uniqueParts.join(', ')
            };
          });
          setSuggestions(formattedSuggestions);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Error fetching location suggestions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timeoutId);
  }, [query, value]);

  const handleSelect = (suggestion: Suggestion) => {
    setQuery(suggestion.display_name);
    onChange(suggestion.display_name);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <MapPin size={18} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full border-2 border-slate-100 rounded-[22px] pl-12 pr-10 py-4 bg-slate-50 font-bold outline-none transition-all text-sm focus:ring-4 focus:ring-indigo-100 ${className}`}
        />
        {isLoading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin">
            <Loader2 size={18} />
          </span>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[24px] shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.place_id}
              onClick={() => handleSelect(suggestion)}
              className="flex items-start gap-3 p-4 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0"
            >
              <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
              <span className="text-xs font-bold text-slate-700 leading-relaxed">
                {suggestion.display_name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
