/** biome-ignore-all lint/suspicious/noArrayIndexKey: Already guaranteed to be stable and unique for this purpose */

import { useId } from "react";

type ListSkeletonProps = {
  count?: number;
};

export default function ListSkeleton({ count = 10 }: ListSkeletonProps) {
  const id = useId();
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={`${id}-${i}`} />
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-[#1e1f22] bg-[#2b2d31]">
      <div className="flex flex-col md:flex-row">
        {/* Mobile Banner Skeleton */}
        <div className="h-32 w-full bg-[#36393f] md:hidden"></div>

        <div className="grow p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row">
            {/* Desktop Icon Skeleton */}
            <div className="hidden shrink-0 md:block">
              <div className="h-16 w-16 rounded-full bg-[#36393f]"></div>
            </div>

            {/* Mobile Header Skeleton */}
            <div className="mb-3 flex items-center md:hidden">
              <div className="mr-3 h-10 w-10 rounded-full bg-[#36393f]"></div>
              <div className="flex flex-col space-y-2">
                <div className="h-5 w-32 rounded bg-[#36393f]"></div>
                <div className="h-4 w-24 rounded bg-[#36393f]"></div>
              </div>
            </div>

            <div className="grow">
              {/* Desktop Header Skeleton */}
              <div className="mb-2 hidden justify-between md:flex md:flex-row md:items-center">
                <div className="flex flex-row space-x-3">
                  <div className="h-6 w-40 rounded bg-[#36393f]"></div>
                  <div className="h-6 w-20 rounded bg-[#36393f]"></div>
                </div>
                <div className="h-8 w-24 rounded bg-[#36393f]"></div>
              </div>

              {/* Description Skeleton */}
              <div className="mb-4 space-y-2">
                <div className="h-4 w-full rounded bg-[#36393f]"></div>
                <div className="h-4 w-3/4 rounded bg-[#36393f]"></div>
              </div>

              {/* Tags Skeleton */}
              <div className="mb-4 flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-6 w-16 rounded-full bg-[#36393f]"></div>
                ))}
              </div>

              {/* Stats Skeleton */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 md:mb-0">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center">
                    <div className="mr-1 h-4 w-4 rounded bg-[#36393f]"></div>
                    <div className="h-4 w-16 rounded bg-[#36393f]"></div>
                  </div>
                ))}
              </div>

              {/* Mobile Button Skeleton */}
              <div className="mt-4 md:hidden">
                <div className="h-8 w-full rounded bg-[#36393f]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
