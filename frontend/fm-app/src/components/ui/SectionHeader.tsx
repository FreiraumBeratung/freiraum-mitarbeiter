export default function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-lg font-semibold tracking-tight">{title}</div>
      {subtitle && <div className="text-sm text-freiraum-sub">{subtitle}</div>}
    </div>
  );
}


