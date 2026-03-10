"use client"

interface ViewToggleProps {
  showMine: boolean
  onToggle: (showMine: boolean) => void
  myLabel: string
  allLabel?: string
}

export function ViewToggle({ showMine, onToggle, myLabel, allLabel = "Everyone" }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onToggle(true)}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          showMine
            ? "bg-white text-gray-900 shadow-sm font-medium"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {myLabel}
      </button>
      <button
        onClick={() => onToggle(false)}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          !showMine
            ? "bg-white text-gray-900 shadow-sm font-medium"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {allLabel}
      </button>
    </div>
  )
}
