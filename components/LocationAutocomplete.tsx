import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, Loader2, AlertCircle } from 'lucide-react';
import { parseLocation } from '../src/utils/location';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  place_id: string;
  display_name: string;
  main_text: string;
  secondary_text: string;
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const HARD_TIMEOUT_MS = 5000;

let mapsScriptPromise: Promise<void> | null = null;

const loadMapsScript = (): Promise<void> => {
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  if (!API_KEY) return Promise.reject(new Error('Google Maps API key is missing'));

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      // Script tag exists (maybe from maps.ts) — poll until ready
      let attempts = 0;
      const poll = () => {
        if ((window as any).google?.maps?.places) { resolve(); return; }
        if (++attempts > 30) { reject(new Error('Google Maps script timed out')); return; }
        setTimeout(poll, 200);
      };
      poll();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Script loaded but places library may need a moment
      let attempts = 0;
      const poll = () => {
        if ((window as any).google?.maps?.places) { resolve(); return; }
        if (++attempts > 20) { reject(new Error('Places library not available')); return; }
        setTimeout(poll, 100);
      };
      poll();
    };
    script.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
};

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Search location...",
  className = ""
}) => {
  const [query, setQuery] = useState(parseLocation(value).address);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelectingRef = useRef(false);
  const userHasTypedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<any>(null);

  useEffect(() => {
    setQuery(parseLocation(value).address);
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

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 3 || isSelectingRef.current || !userHasTypedRef.current) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Hard timeout — no matter what, stop loading after HARD_TIMEOUT_MS
    const hardTimeout = setTimeout(() => {
      setIsLoading(false);
      setError('Location search timed out. Try again.');
    }, HARD_TIMEOUT_MS);

    try {
      await loadMapsScript();

      if (!serviceRef.current) {
        serviceRef.current = new (window as any).google.maps.places.AutocompleteService();
      }

      serviceRef.current.getPlacePredictions(
        { input },
        (predictions: any[] | null, status: string) => {
          clearTimeout(hardTimeout);
          setIsLoading(false);

          const placesStatus = (window as any).google?.maps?.places?.PlacesServiceStatus;
          if (status === placesStatus?.OK && predictions) {
            setError(null);
            setSuggestions(predictions.map(p => ({
              place_id: p.place_id,
              display_name: p.description,
              main_text: p.structured_formatting.main_text,
              secondary_text: p.structured_formatting.secondary_text
            })));
            setIsOpen(true);
          } else if (status === placesStatus?.ZERO_RESULTS) {
            setSuggestions([]);
            setError(null);
          } else {
            setSuggestions([]);
            setError('Location search failed. Check API key.');
            console.error('Places API error:', status);
          }
        }
      );
    } catch (err) {
      clearTimeout(hardTimeout);
      setIsLoading(false);
      setSuggestions([]);
      const msg = err instanceof Error ? err.message : 'Location search unavailable';
      setError(msg);
      console.error('Location autocomplete error:', err);
    }
  }, []);

  // Debounced trigger
  useEffect(() => {
    if (!userHasTypedRef.current || isSelectingRef.current) return;

    const timeoutId = setTimeout(() => {
      fetchSuggestions(query);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query, fetchSuggestions]);

  const handleSelect = (suggestion: Suggestion) => {
    isSelectingRef.current = true;
    setQuery(suggestion.display_name);
    onChange(JSON.stringify({
      address: suggestion.display_name,
      mainText: suggestion.main_text,
      placeId: suggestion.place_id
    }));
    setIsOpen(false);
    setError(null);
  };

  const retrySearch = () => {
    setError(null);
    serviceRef.current = null;
    mapsScriptPromise = null;
    fetchSuggestions(query);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Search size={18} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            isSelectingRef.current = false;
            userHasTypedRef.current = true;
            setError(null);
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full border-2 ${error ? 'border-red-200' : 'border-slate-100'} rounded-[22px] pl-12 pr-10 py-4 bg-slate-50 font-bold outline-none transition-all text-sm focus:ring-4 ${error ? 'focus:ring-red-100' : 'focus:ring-indigo-100'} ${className}`}
        />
        {isLoading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin">
            <Loader2 size={18} />
          </span>
        )}
        {error && !isLoading && (
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400 cursor-pointer hover:text-red-600 transition-colors"
            onClick={retrySearch}
            title="Click to retry"
          >
            <AlertCircle size={18} />
          </span>
        )}
      </div>

      {error && !isLoading && (
        <div className="mt-1.5 flex items-center gap-1.5 px-3">
          <span className="text-xs text-red-500">{error}</span>
          <button
            type="button"
            onClick={retrySearch}
            className="text-xs text-indigo-600 font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[24px] shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200 overflow-y-auto max-h-[300px]">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.place_id}
              onClick={() => handleSelect(suggestion)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-slate-500" />
              </div>
              <div className="flex flex-row items-baseline gap-1.5 overflow-hidden w-full">
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                  {suggestion.main_text}
                </span>
                <span className="text-[13px] text-slate-500 truncate">
                  {suggestion.secondary_text}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
