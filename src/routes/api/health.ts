import { createFileRoute } from "@tanstack/react-router"


export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
           GET: async () => {
            return Response.json(
                { status: "ok", timestamp: Date.now() }, 
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }
    }
}})