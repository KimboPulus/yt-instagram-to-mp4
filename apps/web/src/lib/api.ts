import type {
  CreateJobRequest,
  CreateJobResponse,
  JobStatusResponse,
} from "@clipforge/shared";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100";

export interface ApiRequestError extends Error {
  code?: string;
}

export async function createJob(
  payload: CreateJobRequest,
): Promise<CreateJobResponse> {
  return request<CreateJobResponse>("/jobs", {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function getJob(id: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/jobs/${encodeURIComponent(id)}`);
}

export async function deleteJob(id: string): Promise<void> {
  await request<void>(`/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function request<T>(pathname: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${pathname}`, options);
  } catch {
    throw new Error(
      "The local API is offline. Start Redis, the API and the worker first.",
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error = new Error(
      payload.message ?? `The API returned HTTP ${response.status}.`,
    ) as ApiRequestError;
    error.code = payload.code;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
