import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const popularUSCities = [
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Phoenix, AZ",
  "Philadelphia, PA",
  "San Antonio, TX",
  "San Diego, CA",
  "Dallas, TX",
  "San Jose, CA",
  "Austin, TX",
  "Jacksonville, FL",
  "Fort Worth, TX",
  "Columbus, OH",
  "San Francisco, CA",
  "Charlotte, NC",
  "Indianapolis, IN",
  "Seattle, WA",
  "Denver, CO",
  "Boston, MA",
  "El Paso, TX",
  "Detroit, MI",
  "Nashville, TN",
  "Portland, OR",
  "Memphis, TN",
  "Oklahoma City, OK",
  "Las Vegas, NV",
  "Louisville, KY",
  "Baltimore, MD",
  "Milwaukee, WI",
  "Albuquerque, NM",
  "Tucson, AZ",
  "Fresno, CA",
  "Sacramento, CA",
  "Kansas City, MO",
  "Long Beach, CA",
  "Mesa, AZ",
  "Atlanta, GA",
  "Colorado Springs, CO",
  "Virginia Beach, VA",
  "Raleigh, NC",
  "Omaha, NE",
  "Miami, FL",
  "Oakland, CA",
  "Minneapolis, MN",
  "Tulsa, OK",
  "Wichita, KS",
  "New Orleans, LA",
  "Tampa, FL",
  "Cleveland, OH",
  "Honolulu, HI",
  "Cincinnati, OH",
  "Lexington, KY",
  "Anchorage, AK",
  "Stockton, CA",
  "Toledo, OH",
  "Saint Paul, MN",
  "Newark, NJ",
  "Greensboro, NC",
  "Plano, TX",
  "Henderson, NV",
  "Lincoln, NE",
  "Buffalo, NY",
  "Jersey City, NJ",
  "Chula Vista, CA",
  "Fort Wayne, IN",
  "Orlando, FL",
  "St. Petersburg, FL",
  "Chandler, AZ",
  "Laredo, TX",
  "Norfolk, VA",
  "Durham, NC",
  "Madison, WI",
  "Lubbock, TX",
  "Irvine, CA",
  "Winston-Salem, NC",
  "Glendale, AZ",
  "Garland, TX",
  "Hialeah, FL",
  "Reno, NV",
  "Chesapeake, VA",
  "Gilbert, AZ",
  "Baton Rouge, LA",
  "Irving, TX",
  "Scottsdale, AZ",
  "North Las Vegas, NV",
  "Fremont, CA",
  "Boise, ID",
  "Richmond, VA",
  "San Bernardino, CA",
  "Birmingham, AL",
  "Spokane, WA",
  "Rochester, NY",
  "Des Moines, IA",
  "Modesto, CA",
  "Fayetteville, NC",
  "Tacoma, WA",
  "Oxnard, CA",
  "Fontana, CA",
  "Columbus, GA",
  "Montgomery, AL",
  "Moreno Valley, CA",
  "Shreveport, LA",
  "Aurora, IL",
  "Yonkers, NY",
  "Akron, OH",
  "Huntington Beach, CA",
  "Little Rock, AR",
  "Augusta, GA",
  "Amarillo, TX",
  "Glendale, CA",
  "Mobile, AL",
  "Grand Rapids, MI",
  "Salt Lake City, UT",
  "Tallahassee, FL",
  "Huntsville, AL",
  "Grand Prairie, TX",
  "Knoxville, TN",
  "Worcester, MA",
  "Newport News, VA",
  "Brownsville, TX",
  "Overland Park, KS",
  "Santa Clarita, CA",
  "Providence, RI",
  "Garden Grove, CA",
  "Chattanooga, TN",
  "Oceanside, CA",
  "Jackson, MS",
  "Fort Lauderdale, FL",
  "Santa Rosa, CA",
  "Rancho Cucamonga, CA",
  "Port St. Lucie, FL",
  "Tempe, AZ",
  "Ontario, CA",
  "Vancouver, WA",
  "Cape Coral, FL",
  "Sioux Falls, SD",
  "Springfield, MO",
  "Peoria, AZ",
  "Pembroke Pines, FL",
  "Elk Grove, CA",
  "Salem, OR",
  "Lancaster, CA",
  "Corona, CA",
  "Eugene, OR",
  "Palmdale, CA",
  "Salinas, CA",
  "Springfield, MA",
  "Pasadena, CA",
  "Fort Collins, CO",
  "Hayward, CA",
  "Pomona, CA",
  "Cary, NC",
  "Rockford, IL",
  "Alexandria, VA",
  "Escondido, CA",
  "McKinney, TX",
  "Kansas City, KS",
  "Joliet, IL",
  "Sunnyvale, CA",
  "Torrance, CA",
  "Bridgeport, CT",
  "Lakewood, CO",
  "Hollywood, FL",
  "Paterson, NJ",
  "Naperville, IL",
  "Syracuse, NY",
  "Mesquite, TX",
  "Dayton, OH",
  "Savannah, GA",
  "Clarksville, TN",
  "Orange, CA",
  "Pasadena, TX",
  "Fullerton, CA",
  "Killeen, TX",
  "Frisco, TX",
  "Hampton, VA",
  "McAllen, TX",
  "Warren, MI",
  "Bellevue, WA",
  "West Valley City, UT",
  "Columbia, MO",
  "Olathe, KS",
  "Sterling Heights, MI",
  "New Haven, CT",
  "Miramar, FL",
  "Waco, TX",
  "Thousand Oaks, CA",
  "Cedar Rapids, IA"
];

export function LocationAutocomplete({ 
  value, 
  onChange, 
  placeholder = "e.g., San Francisco, CA",
  className 
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length > 0) {
      const filtered = popularUSCities.filter(city =>
        city.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(true);
    setFocusedIndex(-1);
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleSuggestionClick(suggestions[focusedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setFocusedIndex(-1);
        break;
    }
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow click events to fire
    setTimeout(() => {
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }, 150);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm hover:bg-gray-50",
                index === focusedIndex && "bg-gray-50"
              )}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}