package source

import "sync"

type JobStatus struct {
	Status    string `json:"status"`
	Total     int    `json:"total"`
	Succeeded int    `json:"succeeded"`
	Failed    int    `json:"failed"`
	Skipped   int    `json:"skipped"`
	Error     string `json:"error,omitempty"`
}

type JobStore interface {
	Get(jobID string) (JobStatus, bool)
	Set(jobID string, status JobStatus)
}

type MemoryJobStore struct {
	jobs sync.Map
}

func NewMemoryJobStore() *MemoryJobStore {
	return &MemoryJobStore{}
}

func (s *MemoryJobStore) Get(jobID string) (JobStatus, bool) {
	v, ok := s.jobs.Load(jobID)
	if !ok {
		return JobStatus{}, false
	}
	return v.(JobStatus), true
}

func (s *MemoryJobStore) Set(jobID string, status JobStatus) {
	s.jobs.Store(jobID, status)
}
