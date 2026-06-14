export default function NotFound() {
	return (
		<div className="flex h-screen items-center justify-center bg-[#1e1f22] px-4 text-center">
			<div>
				<h1 className="mb-4 font-bold text-4xl text-white">404 - 找不到頁面</h1>
				<p className="text-lg text-white">
					你所尋找的頁面不存在，或可能已被移除。
				</p>
				<a
					href="/"
					className="mt-6 inline-block rounded bg-white px-4 py-2 font-semibold text-black transition hover:bg-gray-200"
				>
					回到首頁
				</a>
			</div>
		</div>
	);
}
