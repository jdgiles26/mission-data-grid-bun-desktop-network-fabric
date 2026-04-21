/**
 * Virtualized DataTable Component - Efficiently render 1M+ rows with React Window
 * Maintains 60fps scrolling and minimal memory footprint via windowing
 */

import React, { useMemo, useCallback, useState, useRef, forwardRef } from 'react';
import { FixedSizeList as List } from 'react-window';

interface VirtualizedDataTableProps<T> {
  items: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  height: number;
  itemSize?: number;
  width?: string | number;
  onSelectionChange?: (selectedIndices: Set<number>) => void;
  columns?: string[];
  onSort?: (field: string, direction: 'asc' | 'desc') => void;
  className?: string;
}

interface Row<T> {
  item: T;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

const RowRenderer = forwardRef<HTMLDivElement, any>(
  ({ data, index, style }, ref) => {
    const { items, renderRow, selectedIndices, onSelect } = data;
    const item = items[index];
    const isSelected = selectedIndices.has(index);

    return (
      <div
        ref={ref}
        style={style}
        className={`flex items-center px-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
          isSelected ? 'bg-blue-50 dark:bg-blue-900' : ''
        }`}
        onClick={() => onSelect(index)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(index)}
          className="mr-3"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1">{renderRow(item, index)}</div>
      </div>
    );
  }
);

RowRenderer.displayName = 'RowRenderer';

export const VirtualizedDataTable = forwardRef<HTMLDivElement, VirtualizedDataTableProps<any>>(
  (
    {
      items,
      renderRow,
      height,
      itemSize = 32,
      width = '100%',
      onSelectionChange,
      className = '',
    },
    ref
  ) => {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const listRef = useRef<List>(null);

    const handleSelectRow = useCallback((index: number) => {
      setSelectedIndices((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        onSelectionChange?.(newSet);
        return newSet;
      });
    }, [onSelectionChange]);

    const itemData = useMemo(
      () => ({
        items,
        renderRow,
        selectedIndices,
        onSelect: handleSelectRow,
      }),
      [items, renderRow, selectedIndices, handleSelectRow]
    );

    return (
      <div ref={ref} className={`overflow-hidden ${className}`}>
        <div className="sticky top-0 bg-gray-100 dark:bg-gray-900 z-10 px-4 py-2 flex items-center border-b border-gray-300 dark:border-gray-600">
          <input
            type="checkbox"
            checked={selectedIndices.size === items.length && items.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                const allIndices = new Set(items.map((_, i) => i));
                setSelectedIndices(allIndices);
                onSelectionChange?.(allIndices);
              } else {
                setSelectedIndices(new Set());
                onSelectionChange?.(new Set());
              }
            }}
            className="mr-3"
          />
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            {selectedIndices.size} selected
          </span>
        </div>
        <List
          ref={listRef}
          height={height - 40}
          itemCount={items.length}
          itemSize={itemSize}
          width={width}
          itemData={itemData}
        >
          {RowRenderer}
        </List>
      </div>
    );
  }
);

VirtualizedDataTable.displayName = 'VirtualizedDataTable';
