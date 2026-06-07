/**
 * DiscordLoadingPage — Discord 風格的通用加載頁面
 *
 * Props:
 *   loadingText  {string}   主要加載文字          預設: "Starting Discord..."
 *   subText      {string}   副標題文字            預設: "Please hang tight"
 *   loaderType   {string}   "dots" | "ring" | "progress"  預設: "dots"
 *   tips         {string[]} 循環顯示的提示文字陣列  預設: DISCORD_TIPS
 *   showTips     {boolean}  是否顯示提示卡片       預設: true
 *
 * Usage:
 *   <DiscordLoadingPage loadingText="Loading workspace..." loaderType="progress" />
 */

/**
 * DiscordLoadingPage — Discord 風格的通用加載頁面
 *
 * Props:
 *   loadingText  主要加載文字          預設: "Starting Discord..."
 *   subText      副標題文字            預設: "Please hang tight"
 *   loaderType   "dots" | "ring" | "progress"  預設: "dots"
 *   tips         循環顯示的提示文字陣列  預設: DISCORD_TIPS
 *   showTips     是否顯示提示卡片       預設: true
 *
 * Usage:
 *   <DiscordLoadingPage loadingText="Loading workspace..." loaderType="progress" />
 */

import { type CSSProperties, type FC, useEffect, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoaderType = "dots" | "ring" | "progress";

interface LoadingPageProps {
	loadingText?: string;
	subText?: string;
	loaderType?: LoaderType;
	tips?: string[];
	showTips?: boolean;
}

interface ProgressBarProps {
	value: number;
}

interface Particle {
	left: string;
	top: string;
	delay: string;
	dur: string;
}

// ─── Keyframe CSS ────────────────────────────────────────────────────────────

const STYLES = `
  @keyframes dc-eq       { 0%,100%{transform:scaleY(.18)} 50%{transform:scaleY(1)} }
  @keyframes dc-bounce   { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-9px)} }
  @keyframes dc-float    { 0%,100%{transform:translateY(0) rotate(0deg);opacity:.18} 50%{transform:translateY(-18px) rotate(175deg);opacity:.52} }
  @keyframes dc-fade-up  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes dc-tip-fade { 0%,100%{opacity:0;transform:translateY(4px)} 15%,80%{opacity:1;transform:translateY(0)} }
  @keyframes dc-spin     { to{transform:rotate(360deg)} }
` as const;

// ─── Default tips ────────────────────────────────────────────────────────────

const DISCORD_TIPS = [
	"DcHubs 很早就打算做了，但直到 DiscordTW 真的倒下的時候才決定。",
	"我不是給 Gayge。",
	"我很後悔遷移資料表，這讓我忙到凌晨兩點。",
	"千萬不要用 Next.js，會後悔一輩子。",
	"現在的 DcHubs 是用 TanStack Start 做的，快到飛起。",
	"麥當勞的捲捲薯條很好吃。",
];

// ─── Constants ───────────────────────────────────────────────────────────────

const EQ_DELAYS: readonly number[] = [
	0, 0.1, 0.2, 0.32, 0.44, 0.56, 0.44, 0.32, 0.2, 0.1, 0,
];
const EQ_MAX_H: readonly number[] = [
	22, 30, 40, 50, 58, 64, 58, 50, 40, 30, 22,
];
const EQ_PERIODS: readonly number[] = [
	1.1, 1.0, 1.25, 1.05, 1.15, 1.0, 1.2, 1.1, 1.05, 1.15, 1.1,
];

const PARTICLE_COUNT = 11;

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * 等化器波形動畫 — Discord 語音頻道風格
 * 11 根柱子以對稱延遲形成波浪起伏，模擬語音活動指示器
 */
const EqualizerAnimation: FC = () => (
	<div
		aria-hidden="true"
		style={{
			display: "flex",
			alignItems: "flex-end",
			gap: 5,
			height: 68,
			padding: "0 4px",
		}}
	>
		{EQ_DELAYS.map((delay, i) => (
			<div
				key={i}
				style={{
					width: 5,
					height: EQ_MAX_H[i],
					borderRadius: 3,
					background: "#5865F2",
					transformOrigin: "bottom center",
					animation: `dc-eq ${EQ_PERIODS[i]}s ease-in-out ${delay}s infinite`,
				}}
			/>
		))}
	</div>
);

/** 三點跳動 loader */
const DotLoader: FC = () => (
	<div style={{ display: "flex", gap: 7, alignItems: "center" }}>
		{([0, 1, 2] as const).map((i) => (
			<div
				key={i}
				style={{
					width: 9,
					height: 9,
					borderRadius: "50%",
					background: "#5865F2",
					animation: "dc-bounce 1.3s ease-in-out infinite",
					animationDelay: `${i * 0.18}s`,
				}}
			/>
		))}
	</div>
);

/** 旋轉環形 loader */
const RingLoader: FC = () => (
	<div
		style={{
			width: 32,
			height: 32,
			borderRadius: "50%",
			border: "3px solid rgba(88,101,242,.2)",
			borderTopColor: "#5865F2",
			animation: "dc-spin 0.9s linear infinite",
		}}
	/>
);

/** 進度條 loader */
const ProgressBar: FC<ProgressBarProps> = ({ value }) => (
	<div
		style={{
			width: 256,
			height: 5,
			background: "rgba(255,255,255,.1)",
			borderRadius: 3,
			overflow: "hidden",
		}}
	>
		<div
			style={{
				height: "100%",
				width: `${Math.min(Math.max(value, 0), 100)}%`,
				background: "#5865F2",
				borderRadius: 3,
				transition: "width .45s cubic-bezier(.4,0,.2,1)",
			}}
		/>
	</div>
);

// ─── Loader map ───────────────────────────────────────────────────────────────

const LOADER_MAP: Record<LoaderType, FC<{ value?: number }>> = {
	dots: () => <DotLoader />,
	ring: () => <RingLoader />,
	progress: ({ value = 0 }) => <ProgressBar value={value} />,
};

// ─── Particle config (computed once, outside render) ─────────────────────────

const PARTICLES: Particle[] = Array.from(
	{ length: PARTICLE_COUNT },
	(_, i) => ({
		left: `${7 + i * 8.5}%`,
		top: `${10 + (i % 4) * 22}%`,
		delay: `${i * 0.41}s`,
		dur: `${3.4 + (i % 3) * 1.6}s`,
	}),
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
	position: "relative",
	width: "100%",
	height: "100vh",
	minHeight: 480,
	background: "#313338",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	fontFamily:
		"'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
};

const glowStyle: CSSProperties = {
	position: "absolute",
	inset: 0,
	pointerEvents: "none",
	background:
		"radial-gradient(ellipse 65% 58% at 50% 50%, rgba(88,101,242,.09) 0%, transparent 70%)",
};

const tipCardStyle: CSSProperties = {
	maxWidth: 300,
	textAlign: "center",
	padding: "11px 18px",
	background: "rgba(255,255,255,.045)",
	borderRadius: 8,
	border: "1px solid rgba(255,255,255,.07)",
	animation: "dc-tip-fade 3.5s ease both",
};

// ─── Main component ──────────────────────────────────────────────────────────

const LoadingPage: FC<LoadingPageProps> = ({
	loadingText = "Starting Discord...",
	subText = "Please hang tight",
	loaderType = "dots",
	tips = DISCORD_TIPS,
	showTips = true,
}) => {
	const [visible, setVisible] = useState<boolean>(false);
	const [tipIndex, setTipIndex] = useState<number>(0);
	const [progress, setProgress] = useState<number>(6);

	// Entrance animation
	useEffect(() => {
		const t = setTimeout(() => setVisible(true), 80);
		return () => clearTimeout(t);
	}, []);

	// Tip cycling
	useEffect(() => {
		if (!showTips || tips.length === 0) return;
		const id = setInterval(
			() => setTipIndex((i) => (i + 1) % tips.length),
			3500,
		);
		return () => clearInterval(id);
	}, [tips, showTips]);

	// Progress bar auto-advance
	useEffect(() => {
		if (loaderType !== "progress") return;
		setProgress(6);
		const id = setInterval(() => {
			setProgress((p) => {
				const inc = (Math.random() * 9 + 2) * (1 - p / 100);
				return Math.min(p + inc, 93);
			});
		}, 420);
		return () => clearInterval(id);
	}, [loaderType]);

	const ActiveLoader = LOADER_MAP[loaderType];

	const contentStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 28,
		zIndex: 1,
		opacity: visible ? 1 : 0,
		transform: visible ? "translateY(0)" : "translateY(18px)",
		transition: "opacity .65s ease, transform .65s ease",
	};

	return (
		<output aria-label={loadingText} style={rootStyle}>
			<style>{STYLES}</style>

			{/* Ambient radial glow */}
			<div aria-hidden="true" style={glowStyle} />

			{/* Floating particles */}
			{PARTICLES.map((p, i) => (
				<div
					key={i}
					aria-hidden="true"
					style={{
						position: "absolute",
						left: p.left,
						top: p.top,
						width: 5,
						height: 5,
						borderRadius: "50%",
						background: "rgba(88,101,242,.55)",
						animation: `dc-float ${p.dur} ease-in-out infinite`,
						animationDelay: p.delay,
						pointerEvents: "none",
					}}
				/>
			))}

			{/* Main content */}
			<div style={contentStyle}>
				{/* Equalizer animation */}
				<div style={{ animation: "dc-fade-up .5s ease both" }}>
					<EqualizerAnimation />
				</div>

				{/* Text */}
				<div style={{ textAlign: "center" }}>
					<p
						style={{
							color: "#fff",
							fontSize: 19,
							fontWeight: 700,
							margin: "0 0 7px",
							animation: "dc-fade-up .5s ease both",
						}}
					>
						{loadingText}
					</p>
					{subText && (
						<p
							style={{
								color: "#949ba4",
								fontSize: 13.5,
								margin: 0,
								animation: "dc-fade-up .5s .12s ease both",
							}}
						>
							{subText}
						</p>
					)}
				</div>

				{/* Loader */}
				<div style={{ animation: "dc-fade-up .5s .22s ease both" }}>
					<ActiveLoader value={progress} />
				</div>

				{/* Tip card */}
				{showTips && tips.length > 0 && (
					<div key={tipIndex} style={tipCardStyle}>
						<p
							style={{
								color: "#5865F2",
								fontWeight: 700,
								fontSize: 11,
								letterSpacing: ".05em",
								margin: "0 0 5px",
							}}
						>
							你可能不知道的事：
						</p>
						<p style={{ color: "#b5bac1", fontSize: 12.5, margin: 0 }}>
							{tips[tipIndex]}
						</p>
					</div>
				)}
			</div>
		</output>
	);
};

export default LoadingPage;
