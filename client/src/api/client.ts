
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 30000,
});

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }

    if (error.response?.status === 401) {
      return "Your session has expired. Please sign in again.";
    }

    if (!error.response) {
      return "Cannot connect to the server.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
