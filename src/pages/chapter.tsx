import PRSummaryBanner from "@/components/canvas/PRSummaryBanner";
import ChapterView from "@/components/journeys/ChapterView";
import { useMatch, useNavigate } from "react-router-dom";

const ChapterPage = () => {
  const navigate = useNavigate();
  const chapterMatch = useMatch("/journeys/:chapterSlug");

  const activeChapterSlug = chapterMatch?.params.chapterSlug ?? null;
  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: "var(--page-bg)" }}
    >
      <PRSummaryBanner />

      <div className="min-h-0 flex-1">
        <ChapterView
          chapterSlug={activeChapterSlug}
          onBack={() => navigate("/journeys")}
        />
      </div>
    </div>
  );
};

export default ChapterPage;
